import { getEventListeners } from 'node:events';

import { describe, expect, it } from 'vitest';

import { type TaskWork } from '@/@types/index.js';
import { createTaskScope } from '@/task/index.js';

import { flush } from './controlled-work.js';

/**
 * What a task scope costs, counted rather than timed.
 *
 * The limit is a promise about a number — how many tasks are in flight at one
 * moment — and elapsed time cannot see it: a scope that runs nine tasks under a
 * limit of eight finishes as quickly as one that keeps it. So the work counts
 * itself, incrementing on entry and decrementing on exit, and the suite asserts
 * on the peak in both directions: `peak <= limit` alone is kept perfectly by a
 * scope that runs one task at a time.
 */

/** Enough tasks that the limit has to hold repeatedly, not once. */
const TASKS = 400;

/** Counts what the work does while the scope runs it. */
interface Meter {
	/** Work that counts itself and finishes after `delay` microtask turns. */
	readonly work: (delay: number, fails?: boolean) => TaskWork<number>;

	/** Work that counts itself and finishes only when it is called off. */
	readonly untilCancelled: TaskWork<number>;

	/** The most tasks that were ever in flight at once. */
	readonly peak: () => number;

	/** How many pieces of work were started at all. */
	readonly started: () => number;
}

/**
 * Creates a meter over work that takes a varying number of turns to finish.
 *
 * A turn is a microtask rather than a timer: four hundred tasks behind a limit
 * of one, each waiting on a timer, spend seconds in the timer resolution of the
 * machine and assert nothing more for it.
 *
 * @returns The meter.
 */
const createMeter = (): Meter => {
	let current = 0;
	let peak = 0;
	let started = 0;

	return {
		work:
			(delay, fails = false) =>
			async () => {
				started++;
				current++;
				peak = Math.max(peak, current);

				try {
					for (let turn = 0; turn < delay; turn++) await Promise.resolve();

					if (fails) throw new Error('counted failure');

					return delay;
				} finally {
					current--;
				}
			},
		untilCancelled: (token) => {
			started++;

			return new Promise<number>((_resolve, reject) => {
				token.onCancelled(reject);
			});
		},
		peak: () => peak,
		started: () => started,
	};
};

/**
 * A delay that varies from task to task without being random, so a failing run
 * replays exactly.
 *
 * Never shorter than ten turns: the scope takes a few turns of its own between
 * one task finishing and the next starting, and work shorter than that would be
 * finished before its sibling began, which keeps the peak below the limit for a
 * reason that has nothing to do with the limit.
 *
 * @param index Position of the task.
 * @returns How many turns it takes.
 */
const delayOf = (index: number): number => 10 + ((index * 7) % 5);

describe('the concurrency limit', () => {
	it.each([1, 3, 8])(
		'should never have more than %s tasks in flight, and should reach it',
		async (limit) => {
			const meter = createMeter();
			const scope = createTaskScope({ concurrency: limit });

			for (let index = 0; index < TASKS; index++) {
				scope.spawn(meter.work(delayOf(index)));
			}

			await scope.join();

			expect(meter.peak()).toBe(limit);
			expect(meter.started()).toBe(TASKS);
		},
	);

	it('should hold while a failure is calling the rest off', async () => {
		const meter = createMeter();
		const scope = createTaskScope({ concurrency: 4 });

		for (let index = 0; index < TASKS; index++) {
			scope.spawn(meter.work(delayOf(index), index === 40));
		}

		await scope.join().catch(() => {});

		expect(meter.peak()).toBe(4);
	});

	it('should run every task at once when there is no limit', async () => {
		const meter = createMeter();
		const scope = createTaskScope();

		for (let index = 0; index < TASKS; index++) scope.spawn(meter.work(2));

		await scope.join();

		expect(meter.peak()).toBe(TASKS);
	});
});

describe('work that is not started', () => {
	it('should stay unstarted after a failure, beyond the tasks already in flight', async () => {
		const meter = createMeter();
		const limit = 4;
		const scope = createTaskScope({ concurrency: limit });

		// The very first task fails, and the others run until they are called
		// off, so no slot frees up for any reason but the failure.
		scope.spawn(meter.work(1, true));

		for (let index = 1; index < TASKS; index++) {
			scope.spawn(meter.untilCancelled);
		}

		await scope.join().catch(() => {});

		expect(meter.started()).toBe(limit);
	});

	it('should stay unstarted when the scope is cancelled with the queue full', async () => {
		const meter = createMeter();
		const scope = createTaskScope({ concurrency: 2 });

		for (let index = 0; index < TASKS; index++) {
			scope.spawn(meter.untilCancelled);
		}

		await flush();
		scope.cancel();
		await scope.join().catch(() => {});

		expect(meter.started()).toBe(2);
	});
});

describe('what the scope keeps', () => {
	it('should hold no listener on its signal once every task has settled', async () => {
		const meter = createMeter();
		const scope = createTaskScope({ concurrency: 8 });

		for (let index = 0; index < TASKS; index++) {
			scope.spawn(meter.work(delayOf(index)));
		}

		expect(
			getEventListeners(scope.token.signal, 'abort').length,
		).toBeGreaterThanOrEqual(TASKS);

		await scope.join();

		expect(getEventListeners(scope.token.signal, 'abort')).toHaveLength(0);
	});

	it('should hold no listener on its signal after a failure with the queue full', async () => {
		const meter = createMeter();
		const scope = createTaskScope({ concurrency: 4 });

		scope.spawn(meter.work(1, true));

		for (let index = 1; index < TASKS; index++) {
			scope.spawn(meter.untilCancelled);
		}

		await scope.join().catch(() => {});

		expect(getEventListeners(scope.token.signal, 'abort')).toHaveLength(0);
	});

	it('should hold no listener on its signal after it is cancelled with the queue full', async () => {
		const meter = createMeter();
		const scope = createTaskScope({ concurrency: 2 });

		for (let index = 0; index < TASKS; index++) {
			scope.spawn(meter.untilCancelled);
		}

		await flush();
		scope.cancel();
		await scope.join().catch(() => {});

		expect(getEventListeners(scope.token.signal, 'abort')).toHaveLength(0);
	});

	it('should hold no listener for running tasks cancelled one by one', async () => {
		const meter = createMeter();
		const scope = createTaskScope();

		const tasks = Array.from({ length: TASKS }, () =>
			scope.spawn(meter.untilCancelled),
		);

		await flush();

		for (const task of tasks) task.cancel();

		await scope.join();

		expect(meter.started()).toBe(TASKS);
		expect(getEventListeners(scope.token.signal, 'abort')).toHaveLength(0);
	});

	it('should release its hold on a parent token once it is joined, never disposed', async () => {
		const parent = createTaskScope();

		for (let index = 0; index < TASKS; index++) {
			const scope = createTaskScope({ token: parent.token });

			scope.spawn(() => index);

			await scope.join();
		}

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(0);

		await parent.join();
	});

	it('should release its hold on a parent token when it is disposed', async () => {
		const parent = createTaskScope();
		const scope = createTaskScope({ token: parent.token });

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(1);

		await scope[Symbol.asyncDispose]();

		expect(getEventListeners(parent.token.signal, 'abort')).toHaveLength(0);

		await parent.join();
	});
});
