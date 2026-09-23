import { describe, expect, it } from 'vitest';

import { type WorkerPool } from '@/@types/index.js';
import { createPool } from '@/pool/index.js';

import { createFakeWorkers, type FakeWorkers, NOWHERE } from './fake-worker.js';

/**
 * What the pool costs, counted rather than timed.
 *
 * The promise `workers` makes is about a number, and the number is how many
 * elements are out at one moment. Elapsed time cannot see it: a run that hands
 * out five elements to four workers finishes just as quickly as one that
 * respects the bound, and on a fast machine a sequential implementation beats
 * both. So the counting happens where the elements arrive — in the workers
 * themselves, which here are `fake-worker.ts` rather than threads.
 *
 * Both directions, as `docs/testing.md` requires: `peak <= workers` alone is
 * satisfied perfectly by a pool that never used more than one.
 */

/** Enough elements that the bound has to hold repeatedly, not once. */
const ELEMENTS: readonly number[] = Array.from(
	{ length: 60 },
	(_, index) => index + 1,
);

/**
 * Creates a pool over workers that count what they are given.
 *
 * @param fake The workers to hand it.
 * @param workers How many to run.
 * @returns The pool.
 */
const countedPool = (
	fake: FakeWorkers,
	workers: number,
): WorkerPool<number, number> =>
	createPool<number, number>(
		{ module: NOWHERE, export: 'echo', workers },
		fake.spawn,
		NOWHERE,
	);

describe('what one run costs', () => {
	it.each([1, 2, 4])(
		'should never have more than %s elements in flight, and should reach it',
		async (workers) => {
			const fake = createFakeWorkers({ auto: true });

			await countedPool(fake, workers).map(ELEMENTS);

			expect(fake.peak()).toBe(workers);
		},
	);

	it('should hand out each element exactly once', async () => {
		const fake = createFakeWorkers({ auto: true });

		await countedPool(fake, 4).map(ELEMENTS);

		expect(fake.posted()).toEqual(ELEMENTS);
	});

	it('should start its workers once, however many batches run', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = countedPool(fake, 4);

		for (let batch = 0; batch < 5; batch++) await pool.map(ELEMENTS);

		expect(fake.spawned()).toBe(4);
	});
});

describe('what overlapping runs cost', () => {
	it('should hold the bound across two runs on one pool', async () => {
		// The bound is a property of the pool, not of a run. Two runs sharing
		// the workers is how it comes to be exceeded without any single run ever
		// handing out more than it should.
		const fake = createFakeWorkers({ auto: true });
		const pool = countedPool(fake, 4);

		await Promise.all([pool.map(ELEMENTS), pool.map(ELEMENTS)]);

		expect(fake.peak()).toBe(4);
	});

	it('should hand out every element of both runs exactly once', async () => {
		const fake = createFakeWorkers({ auto: true });
		const pool = countedPool(fake, 4);

		await Promise.all([pool.map(ELEMENTS), pool.map(ELEMENTS)]);

		expect(fake.posted()).toHaveLength(ELEMENTS.length * 2);
	});
});
