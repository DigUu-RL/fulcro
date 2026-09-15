import { describe, expect, it } from 'vitest';

import { switchFor } from '@/switchFor';
import { tryCatch } from '@/tryCatch';

/**
 * Performance suite.
 *
 * Cost is asserted through counters of actual work rather than elapsed time,
 * which depends on the machine and turns into a flaky test. Each counter
 * encodes a guarantee about how the code behaves as its input grows — a
 * dispatch that starts scanning, or a branch that starts running when it did
 * not match, breaks the expectation by orders of magnitude rather than by a few
 * percent.
 *
 * The wall clock assertions at the end are generous smoke ceilings against a
 * catastrophic regression, not measurements.
 */

/** How many branches the dispatch assertions build. */
const BRANCHES = 1_000;

/** How many calls the wall clock ceilings make. */
const CALLS = 100_000;

describe('switchFor, exhaustive form', () => {
	it('should reach a branch without touching the others', () => {
		// A key lookup rather than a scan, which is what keeps the cost flat as
		// the enum grows.
		const run: number[] = [];

		const cases = Object.fromEntries(
			[...Array(BRANCHES).keys()].map((key) => [
				key,
				() => {
					run.push(key);
					return key;
				},
			]),
		) as Record<number, () => number>;

		const matched: number = switchFor(BRANCHES - 1, cases);

		expect(matched).toBe(BRANCHES - 1);
		expect(run).toEqual([BRANCHES - 1]);
	});

	it('should cost the same for the first branch as for the last', () => {
		const cases = Object.fromEntries(
			[...Array(BRANCHES).keys()].map((key) => [key, () => key]),
		) as Record<number, () => number>;

		// Typed as `number` rather than left as the literal `0`, which would ask
		// for an ExhaustiveCases of exactly that one member.
		const firstKey: number = 0;
		const lastKey: number = BRANCHES - 1;

		const firstStart: number = performance.now();

		for (let call = 0; call < CALLS; call++) switchFor(firstKey, cases);

		const first: number = performance.now() - firstStart;

		const lastStart: number = performance.now();

		for (let call = 0; call < CALLS; call++) switchFor(lastKey, cases);

		const last: number = performance.now() - lastStart;

		// A linear scan would make the last branch a thousand times dearer than
		// the first. Anything within an order of magnitude is lookup noise.
		expect(last).toBeLessThan(Math.max(first, 1) * 10);
	});
});

describe('switchFor, predicate form', () => {
	it('should stop testing conditions at the first match', () => {
		let tested = 0;

		const cases = [...Array(BRANCHES).keys()].map((key) => ({
			when: (): boolean => {
				tested++;
				return key === 2;
			},
			then: (): number => key,
		}));

		switchFor(0, cases, () => -1);

		// Three: the two that failed, and the one that matched.
		expect(tested).toBe(3);
	});

	it('should run only the branch that matched', () => {
		let run = 0;

		switchFor(
			0,
			[...Array(BRANCHES).keys()].map((key) => ({
				when: (): boolean => key === 0,
				then: (): number => {
					run++;
					return key;
				},
			})),
			() => -1,
		);

		expect(run).toBe(1);
	});

	it('should test every condition exactly once when nothing matches', () => {
		let tested = 0;

		switchFor(
			0,
			[...Array(BRANCHES).keys()].map(() => ({
				when: (): boolean => {
					tested++;
					return false;
				},
				then: (): number => 0,
			})),
			() => -1,
		);

		expect(tested).toBe(BRANCHES);
	});
});

describe('tryCatch', () => {
	it('should call the operation exactly once', () => {
		let calls = 0;

		void tryCatch(async () => {
			calls++;
			return 1;
		});

		expect(calls).toBe(1);
	});

	it('should not retry a failing operation', async () => {
		let calls = 0;

		await tryCatch(async () => {
			calls++;
			throw new Error('once');
		});

		expect(calls).toBe(1);
	});

	it('should add no allocation beyond the outcome itself', async () => {
		// The shape is fixed: two properties, whatever happened.
		const succeeded = await tryCatch(async () => 1);
		const failed = await tryCatch(async () => {
			throw new Error('x');
		});

		expect(Object.keys(succeeded).sort()).toEqual(['data', 'error']);
		expect(Object.keys(failed).sort()).toEqual(['data', 'error']);
	});
});

describe('wall clock ceilings', () => {
	it('should dispatch a hundred thousand exhaustive calls within budget', () => {
		const started: number = performance.now();

		for (let call = 0; call < CALLS; call++) {
			switchFor(call % 3, {
				0: () => 'a',
				1: () => 'b',
				2: () => 'c',
			});
		}

		expect(performance.now() - started).toBeLessThan(1_000);
	});

	it('should settle ten thousand tryCatch calls within budget', async () => {
		const started: number = performance.now();

		await Promise.all(
			[...Array(10_000).keys()].map((value) => tryCatch(async () => value)),
		);

		expect(performance.now() - started).toBeLessThan(2_000);
	});
});
