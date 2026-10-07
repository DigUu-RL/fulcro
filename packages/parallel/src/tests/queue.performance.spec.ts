import { describe, expect, it } from 'vitest';

import { createWaitingQueue, type Waiting } from '@/task/queue.js';

/**
 * What the waiting queue keeps, counted.
 *
 * The shape that matters is a long-lived scope that is never idle: one task
 * always waiting, so the queue never empties and never gets the cheap reset an
 * empty queue allows. Without compaction it keeps an entry for every task it
 * ever started, and the count of entries held is what shows it.
 */

/** Far more tasks than the compaction threshold, so it has to run repeatedly. */
const TASKS = 50_000;

/**
 * Creates an entry whose start does nothing.
 *
 * @returns The entry.
 */
const idleEntry = (): Waiting => ({ start: () => {} });

describe('what a queue that never empties keeps', () => {
	it('should hold a bounded number of entries, not one per task ever started', () => {
		const queue = createWaitingQueue();
		let peak = 0;

		queue.push(idleEntry());

		for (let index = 0; index < TASKS; index++) {
			queue.push(idleEntry());

			let room = 1;

			queue.startWhile(() => room-- > 0);
			peak = Math.max(peak, queue.held());
		}

		expect(peak).toBeLessThanOrEqual(2 * 1024 + 2);
	});

	it('should start every task exactly once across compactions', () => {
		const queue = createWaitingQueue();
		let starts = 0;

		const counted = (): Waiting => ({
			start: () => {
				starts++;
			},
		});

		queue.push(counted());

		for (let index = 0; index < TASKS; index++) {
			queue.push(counted());

			let room = 1;

			queue.startWhile(() => room-- > 0);
		}

		queue.startWhile(() => true);

		expect(starts).toBe(TASKS + 1);
		expect(queue.held()).toBe(0);
	});
});
