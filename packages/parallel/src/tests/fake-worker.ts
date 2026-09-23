import { SpawnWorker, WorkerHandle } from '@/@types/index.js';

/**
 * Workers the test drives by hand.
 *
 * Real threads prove the pool works; they cannot prove *when* it does what it
 * does. An interleaving — a second run arriving mid-flight, an abort while
 * every worker is busy, a load that fails on one worker out of four — is a
 * specific ordering of replies, and a real worker replies whenever it is
 * finished. So the orderings are asserted against a worker that replies only
 * when this file is told to.
 *
 * It also counts, which is the other half: tasks in flight at their peak,
 * handlers currently registered, workers created and terminated. Those are
 * integers, the same on every machine, and they are what the pool's promises
 * are actually made of.
 */

/** What the pool sends a worker. */
type Incoming =
	| { readonly kind: 'init' }
	| { readonly kind: 'task'; readonly id: number; readonly value: unknown };

/** What a listener registered on a worker receives. */
type Handler = (message: unknown, failure?: unknown) => void;

/** How the fake workers should behave. */
export interface FakeOptions {
	/** Answers every task on the next microtask rather than on demand. */
	readonly auto?: boolean;

	/** Workers, by index, that report they could not load the task module. */
	readonly broken?: readonly number[];

	/** Workers, by index, whose `terminate` rejects. */
	readonly unstoppable?: readonly number[];
}

/** The workers, and what they have been asked to do so far. */
export interface FakeWorkers {
	/** Hands the pool a worker. */
	readonly spawn: SpawnWorker;

	/** How many workers have been created. */
	readonly spawned: () => number;

	/**
	 * Elements posted to a worker, in the order they were handed out.
	 *
	 * The element rather than its identifier, because identifiers are positions
	 * and every run starts counting from zero — which is the collision the pool
	 * has to keep two runs out of in the first place.
	 */
	readonly posted: () => readonly unknown[];

	/** Tasks posted and not yet answered. */
	readonly inFlight: () => number;

	/** The most tasks that were ever in flight at one moment. */
	readonly peak: () => number;

	/** Handlers registered across every worker right now. */
	readonly handlers: () => number;

	/**
	 * How many workers have been terminated.
	 *
	 * Workers, not calls: `close` and a run that ends with elements still out
	 * both discard the pool, so a worker can legitimately be told to stop
	 * twice, and a real `terminate` on a dead thread resolves.
	 */
	readonly terminated: () => number;

	/** Answers one task with the value it was given. */
	readonly complete: (id: number) => void;

	/** Answers every task in flight. */
	readonly completeAll: () => void;

	/** Reports that one task threw. */
	readonly fail: (id: number, message: string) => void;
}

/**
 * Creates workers that reply when told to.
 *
 * @param options How they should behave.
 * @returns The workers, and the counters over them.
 */
export const createFakeWorkers = (options: FakeOptions = {}): FakeWorkers => {
	/** Handlers registered on each worker, by the order it was created in. */
	const listeners = new Map<number, Set<Handler>>();

	/** Tasks posted and not yet answered, by identifier. */
	const running = new Map<number, { worker: number; value: unknown }>();

	const posted: unknown[] = [];

	/** Workers told to stop, by the order they were created in. */
	const stopped = new Set<number>();

	let spawned = 0;
	let inFlight = 0;
	let peak = 0;

	/**
	 * Delivers a message to one worker's handlers.
	 *
	 * Over a copy: a handler is entitled to remove itself, and the run's
	 * cleanup does exactly that.
	 *
	 * @param worker Which worker is replying.
	 * @param message What it replies.
	 * @param failure A failure of the worker itself, rather than a reply.
	 */
	const emit = (worker: number, message: unknown, failure?: unknown): void => {
		for (const handler of [...(listeners.get(worker) ?? [])]) {
			handler(message, failure);
		}
	};

	/**
	 * Takes one task out of flight.
	 *
	 * @param id Task to settle.
	 * @returns Where it was running, and the value it was given.
	 * @throws {Error} When no such task is in flight.
	 */
	const settle = (id: number): { worker: number; value: unknown } => {
		const task = running.get(id);

		if (task === undefined) {
			throw new Error(
				`No task ${id} is in flight; ${[...running.keys()]} are.`,
			);
		}

		running.delete(id);
		inFlight--;

		return task;
	};

	const complete = (id: number): void => {
		const task = settle(id);

		emit(task.worker, { kind: 'done', id, value: task.value });
	};

	const spawn: SpawnWorker = (): WorkerHandle => {
		const index: number = spawned++;

		listeners.set(index, new Set());

		return {
			post: (message: unknown): void => {
				const incoming = message as Incoming;

				if (incoming.kind === 'init') {
					queueMicrotask(() => {
						emit(
							index,
							options.broken?.includes(index) === true
								? {
										kind: 'broken',
										error: `Worker ${index} could not load the module.`,
									}
								: { kind: 'ready' },
						);
					});

					return;
				}

				posted.push(incoming.value);
				running.set(incoming.id, { worker: index, value: incoming.value });
				inFlight++;
				peak = Math.max(peak, inFlight);

				if (options.auto === true) queueMicrotask(() => complete(incoming.id));
			},

			listen: (handler: Handler): (() => void) => {
				listeners.get(index)?.add(handler);

				return (): void => {
					listeners.get(index)?.delete(handler);
				};
			},

			terminate: async (): Promise<void> => {
				stopped.add(index);

				// What a real worker does: a terminated thread exits with a
				// non-zero code, and both adapters turn that into a failure on
				// whatever handlers are still registered. A run whose workers are
				// taken away underneath it therefore rejects rather than waiting
				// for replies that will never come.
				emit(index, undefined, new Error('The worker exited with code 1.'));

				if (options.unstoppable?.includes(index) === true) {
					throw new Error(`Worker ${index} would not stop.`);
				}
			},
		};
	};

	return {
		spawn,
		spawned: (): number => spawned,
		posted: (): readonly unknown[] => posted,
		inFlight: (): number => inFlight,
		peak: (): number => peak,
		handlers: (): number =>
			[...listeners.values()].reduce((total, set) => total + set.size, 0),
		terminated: (): number => stopped.size,
		complete,

		completeAll: (): void => {
			for (const id of [...running.keys()]) complete(id);
		},

		fail: (id: number, message: string): void => {
			const task = settle(id);

			emit(task.worker, { kind: 'failed', id, error: message });
		},
	};
};

/** A URL the fake workers never load. */
export const NOWHERE = new URL('file:///fake/work.mjs');

/**
 * Turns the microtask queue until something is true.
 *
 * Microtasks rather than timers, so a suite that drives an interleaving by
 * hand never asserts anything about how fast the machine is. The bound is
 * there to fail the test rather than hang the run when the condition is one
 * the pool will never reach.
 *
 * @param condition What is being waited for.
 * @param describe What to say if it never holds.
 * @param allowed How many turns to give it.
 * @throws {Error} When the condition does not hold within `allowed` turns.
 */
export const until = async (
	condition: () => boolean,
	describe: string,
	allowed = 500,
): Promise<void> => {
	for (let turn = 0; turn < allowed; turn++) {
		if (condition()) return;

		await Promise.resolve();
	}

	throw new Error(`${describe} did not happen within ${allowed} turns.`);
};
