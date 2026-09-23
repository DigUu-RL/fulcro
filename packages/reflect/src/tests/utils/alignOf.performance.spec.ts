import { describe, expect, it } from 'vitest';

import { alignOf } from '@/functions/utils/alignOf';

/**
 * Performance suite for `alignOf`.
 *
 * The same two assertions as for `sizeOf`: no resolved call reaches the
 * throwing runtime implementation, counted, and a resolved call costs what the
 * literal it became costs, as a ratio measured in the same run.
 */

/** How many calls each loop makes. */
const CALLS = 100_000;

type Narrow = {
	readonly '~layout': { readonly size: 12; readonly alignment: 4 };
};

/**
 * Times a loop.
 *
 * @param work Work to repeat, returning a number to keep it from being elided.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (work: () => number): number => {
	let sink = 0;
	const started: number = performance.now();

	for (let call = 0; call < CALLS; call++) sink += work();

	const elapsed: number = performance.now() - started;

	if (sink !== CALLS * 4) throw new Error('unreachable: every call reads 4');

	return Math.max(elapsed, 1);
};

describe('what the transformer leaves behind', () => {
	it('should never reach the runtime implementation', () => {
		let reached = 0;

		for (let call = 0; call < CALLS; call++) {
			try {
				alignOf<Narrow>();
			} catch {
				reached++;
			}
		}

		expect(reached).toBe(0);
	});

	it('should cost what the literal costs', () => {
		const baseline: number = timed(() => 4);
		const resolved: number = timed(() => alignOf<Narrow>());

		expect(resolved).toBeLessThan(baseline * 25);
	});
});
