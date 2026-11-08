import { describe, expect, it } from 'vitest';

import { createWaitingQueue, type Waiting } from '@/src/task/queue.js';

/**
 * Waiting queue suite.
 *
 * The queue a task scope keeps its waiting tasks in: oldest first, started
 * only while there is room, and an entry withdrawn by clearing its `start`.
 */

/**
 * Creates an entry that records its start.
 *
 * @param started Where the entry writes its name when started.
 * @param name What it writes.
 * @returns The entry.
 */
const entryFor = (started: string[], name: string): Waiting => {
	return {
		start: (): void => {
			started.push(name);
		},
	};
};

describe('startWhile', () => {
	it('should start entries oldest first', () => {
		const queue = createWaitingQueue();
		const started: string[] = [];

		for (const name of ['Gold Leader', 'Gold Two', 'Gold Three']) {
			queue.push(entryFor(started, name));
		}

		queue.startWhile(() => true);

		expect(started).toEqual(['Gold Leader', 'Gold Two', 'Gold Three']);
	});

	it('should stop as soon as there is no room, and resume from there', () => {
		const queue = createWaitingQueue();
		const started: string[] = [];
		let room = 2;

		for (const name of ['Gold Leader', 'Gold Two', 'Gold Three', 'Gold Five']) {
			queue.push(entryFor(started, name));
		}

		queue.startWhile(() => room-- > 0);

		expect(started).toEqual(['Gold Leader', 'Gold Two']);

		queue.startWhile(() => true);

		expect(started).toEqual(['Gold Leader', 'Gold Two', 'Gold Three', 'Gold Five']);
	});

	it('should skip an entry whose start was cleared, without using room for it', () => {
		const queue = createWaitingQueue();
		const started: string[] = [];
		const withdrawn: Waiting = entryFor(started, 'withdrawn');
		let room = 1;

		queue.push(withdrawn);
		queue.push(entryFor(started, 'kept'));
		withdrawn.start = null;

		queue.startWhile(() => room-- > 0);

		expect(started).toEqual(['kept']);
	});

	it('should start each entry once, and clear it before starting it', () => {
		const queue = createWaitingQueue();
		const entry: Waiting = { start: null };
		let starts = 0;

		entry.start = (): void => {
			starts++;

			expect(entry.start).toBeNull();
		};

		queue.push(entry);
		queue.startWhile(() => true);
		queue.startWhile(() => true);

		expect(starts).toBe(1);
	});

	it('should keep working after it empties', () => {
		const queue = createWaitingQueue();
		const started: string[] = [];

		queue.push(entryFor(started, 'Red Leader'));
		queue.startWhile(() => true);
		queue.push(entryFor(started, 'Red Two'));
		queue.startWhile(() => true);

		expect(started).toEqual(['Red Leader', 'Red Two']);
		expect(queue.held()).toBe(0);
	});
});
