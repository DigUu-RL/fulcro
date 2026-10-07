/**
 * A task waiting for its turn.
 *
 * `start` is cleared when the task is called off while waiting, so the queue
 * stops holding the work — and whatever it closed over — at once rather than
 * when the dead entry eventually reaches the front.
 */
export interface Waiting {
	start: (() => void) | null;
}

/** The tasks of one scope waiting for their turn, oldest first. */
export interface WaitingQueue {
	/**
	 * Adds a task at the back.
	 *
	 * @param entry The task.
	 */
	readonly push: (entry: Waiting) => void;

	/**
	 * Starts tasks from the front while there is room for them.
	 *
	 * @param hasRoom Whether one more task may start now.
	 */
	readonly startWhile: (hasRoom: () => boolean) => void;

	/**
	 * How many entries the queue still holds, started ones included. For the
	 * suites, which count what the queue keeps.
	 *
	 * @returns The number of entries held.
	 */
	readonly held: () => number;
}

/**
 * How far the front may move before the entries behind it are let go.
 *
 * Large enough that compacting is rare next to the starts that pay for it, so
 * each start costs a constant share of one copy.
 */
const COMPACT_AFTER = 1024;

/**
 * Creates an empty queue.
 *
 * Read from `head` rather than shifted, because `shift` moves every entry
 * behind it and a scope spawning ten thousand tasks behind a limit of eight
 * would pay that ten thousand times. The entries in front of `head` are let go
 * when the queue empties, or, for a queue that never empties, once they are
 * both many and the larger part of the array — otherwise a long-lived scope
 * with always one task waiting would keep an entry for every task it ever ran.
 *
 * @returns The queue.
 */
export const createWaitingQueue = (): WaitingQueue => {
	let entries: Waiting[] = [];
	let head = 0;

	const compact = (): void => {
		if (head === entries.length) {
			entries = [];
			head = 0;

			return;
		}

		if (head < COMPACT_AFTER || head * 2 < entries.length) return;

		entries = entries.slice(head);
		head = 0;
	};

	return Object.freeze({
		push: (entry: Waiting): void => {
			entries.push(entry);
		},
		startWhile: (hasRoom: () => boolean): void => {
			while (head < entries.length) {
				const start: (() => void) | null = entries[head].start;

				// A withdrawn entry is passed over whether or not there is room,
				// so it is let go now rather than when the next start comes.
				if (start === null) {
					head++;
					continue;
				}

				if (!hasRoom()) break;

				entries[head++].start = null;
				start();
			}

			compact();
		},
		held: (): number => entries.length,
	});
};
