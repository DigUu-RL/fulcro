import {
	PoolOptions,
	RunOptions,
	SpawnWorker,
	WorkerHandle,
	WorkerPool,
} from '@/@types/index.js';

/**
 * The pool, with the one platform-specific piece handed in.
 *
 * Everything here is the same on a browser and on Node: how many workers to
 * start, how elements are handed out, what happens when one fails, and how the
 * whole thing shuts down. Only {@link SpawnWorker} differs, which is why it is
 * a parameter rather than an import.
 */

/** How many workers to start when the caller does not say. */
const DEFAULT_WORKERS = 4;

/** What a worker sends back. */
type Outgoing =
	| { readonly kind: 'ready' }
	| { readonly kind: 'broken'; readonly error: string }
	| { readonly kind: 'done'; readonly id: number; readonly value: unknown }
	| { readonly kind: 'failed'; readonly id: number; readonly error: string };

/** A worker and what it is currently doing. */
interface Member {
	readonly handle: WorkerHandle;

	/** The element it is working on, if any. */
	busyWith: number | null;
}

/**
 * How many workers the machine can usefully run.
 *
 * `navigator.hardwareConcurrency` is a web standard that Node adopted, so the
 * same line answers on both. The fallback exists for a runtime that reports
 * neither rather than as a guess about hardware.
 *
 * @returns The worker count.
 */
const availableWorkers = (): number => {
	if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0) {
		return navigator.hardwareConcurrency;
	}

	return DEFAULT_WORKERS;
};

/**
 * Creates a pool over one named task.
 *
 * @template T Type of the elements handed to the workers.
 * @template R Type the task produces.
 * @param options Where the work lives, and how many workers to run.
 * @param spawn How to start a worker on this runtime.
 * @param workerUrl Module the workers themselves run.
 * @returns The pool.
 * @throws {Error} When `workers` is not a positive integer.
 */
export const createPool = <T, R>(
	options: PoolOptions,
	spawn: SpawnWorker,
	workerUrl: URL,
): WorkerPool<T, R> => {
	const size: number = options.workers ?? availableWorkers();

	if (!Number.isInteger(size) || size < 1) {
		throw new Error(
			`A pool needs a positive integer worker count, and was given ${options.workers}.`,
		);
	}

	/**
	 * Workers, started on the first run rather than at construction.
	 *
	 * The promise rather than the array it resolves to, because starting is
	 * itself something a caller can arrive in the middle of: a `close()` during
	 * the first run's start would otherwise find nothing to close and leave the
	 * threads it could not see running for the life of the process.
	 */
	let members: Promise<Member[]> | null = null;

	/**
	 * Starts the workers and waits for each to load the task module.
	 *
	 * Deferred to the first run, so a pool nobody uses costs no threads. Every
	 * worker is told what to import once, rather than per element.
	 *
	 * @returns The members, ready for work.
	 */
	const ready = (): Promise<Member[]> => {
		if (members !== null) return members;

		const starting = (async (): Promise<Member[]> => {
			const started: Member[] = Array.from({ length: size }, () => ({
				handle: spawn(workerUrl),
				busyWith: null,
			}));

			// The handler that waits for `ready` is wanted for the length of the
			// start and no longer: a run registers its own, and one left behind
			// here would read that run's replies as well.
			const stops: (() => void)[] = [];

			try {
				await Promise.all(
					started.map(
						(member) =>
							new Promise<void>((resolve, reject) => {
								stops.push(
									member.handle.listen((message, failure) => {
										if (failure !== undefined) {
											reject(failure);
											return;
										}

										const reply = message as Outgoing;

										if (reply.kind === 'ready') resolve();
										if (reply.kind === 'broken') reject(new Error(reply.error));
									}),
								);

								member.handle.post({
									kind: 'init',
									module:
										typeof options.module === 'string'
											? options.module
											: options.module.href,
									export: options.export,
								});
							}),
					),
				);
			} catch (error) {
				// One worker failing to load says nothing about the others, which
				// are already running and would otherwise outlive the pool that
				// never finished being built. `allSettled` rather than `all`: the
				// load failure is the cause the caller needs, and a termination
				// that also fails must not take its place.
				members = null;

				await Promise.allSettled(
					started.map((member) => member.handle.terminate()),
				);

				throw error;
			} finally {
				for (const stop of stops) stop();
			}

			return started;
		})();

		members = starting;

		return starting;
	};

	/** The run in progress, which the next one waits for. */
	let inProgress: Promise<void> = Promise.resolve();

	/**
	 * Runs every element, yielding each result as its worker finishes it.
	 *
	 * @param items Elements to process.
	 * @param runOptions Cancellation and transfers.
	 * @returns The results, in completion order, each tagged with its position.
	 */
	const run = async function* (
		items: Iterable<T>,
		runOptions?: RunOptions,
	): AsyncIterable<{ position: number; value: R }> {
		const signal: AbortSignal | undefined = runOptions?.signal;

		// Before anything is started, so that a run called off in advance hands
		// out no elements at all rather than posting them and terminating the
		// workers that took them.
		signal?.throwIfAborted();

		const pool: Member[] = await ready();
		const pending: T[] = [...items];

		if (pending.length === 0) return;

		const finished: { position: number; value: R }[] = [];
		const outstanding = new Map<number, Member>();

		let failure: { readonly error: unknown } | null = null;
		let wake: (() => void) | null = null;
		let handedOut = 0;
		let delivered = 0;

		/** Reads the failure through a call, which control flow does not narrow. */
		const failed = (): { readonly error: unknown } | null => failure;

		const notify = (): void => {
			const waiting: (() => void) | null = wake;

			wake = null;
			waiting?.();
		};

		// Registered for this run and removed when it ends. A handler left behind
		// reads the next run's replies into this run's buffers, and holds them
		// alive for as long as the pool.
		const stops: (() => void)[] = pool.map((member) =>
			member.handle.listen((message, workerFailure) => {
				if (workerFailure !== undefined) {
					failure ??= { error: workerFailure };
					notify();
					return;
				}

				const reply = message as Outgoing;

				if (reply.kind === 'done') {
					finished.push({ position: reply.id, value: reply.value as R });
					member.busyWith = null;
					outstanding.delete(reply.id);
					notify();
					return;
				}

				if (reply.kind === 'failed') {
					failure ??= { error: new Error(reply.error) };
					member.busyWith = null;
					outstanding.delete(reply.id);
					notify();
				}
			}),
		);

		// An abort is not a reply, so nothing else would wake the loop: a run
		// whose workers are all busy would learn it had been called off only when
		// one of them finished on its own, which is the whole duration the pool
		// exists to spend.
		const onAbort = (): void => notify();

		signal?.addEventListener('abort', onAbort);

		/** Hands elements to whichever workers are free. */
		const dispatch = (): void => {
			for (const member of pool) {
				if (member.busyWith !== null) continue;
				if (handedOut >= pending.length) return;
				if (failed() !== null) return;
				if (signal?.aborted === true) return;

				const position: number = handedOut++;
				const value: T = pending[position];

				member.busyWith = position;
				outstanding.set(position, member);

				member.handle.post(
					{ kind: 'task', id: position, value },
					runOptions?.transfer?.(value),
				);
			}
		};

		try {
			// Inside the `try`, so that the handlers registered above are removed
			// even by a first dispatch that throws.
			dispatch();

			while (delivered < pending.length) {
				signal?.throwIfAborted();

				const broken = failed();

				if (broken !== null) throw broken.error;

				const next = finished.shift();

				if (next !== undefined) {
					delivered++;
					yield next;
					dispatch();
					continue;
				}

				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
		} finally {
			signal?.removeEventListener('abort', onAbort);

			for (const stop of stops) stop();

			// A worker cannot be asked to stop mid-task, only terminated. So a run
			// that ends while elements are still out — aborted, failed, or simply
			// abandoned by its consumer — discards the whole pool rather than
			// handing the next run a worker still busy with something nobody is
			// waiting for. The next run builds a fresh one, and the cost of that
			// is paid only by a run that did not finish.
			if (outstanding.size > 0) {
				const discarded: Member[] = pool;

				members = null;
				outstanding.clear();

				// `allSettled`, because this runs while the run is already throwing
				// the abort or the task failure the caller is waiting to read, and a
				// worker that also fails to terminate must not replace it.
				await Promise.allSettled(
					discarded.map((member) => member.handle.terminate()),
				);
			}
		}
	};

	/**
	 * Runs every element, once whatever was running before has finished.
	 *
	 * Two overlapping runs on one pool cannot share it: replies carry the
	 * element's position, positions start at zero in every run, and a handler
	 * reading the other run's reply releases a worker that is still busy — which
	 * is how a pool of four comes to run five. Queueing is what makes `workers`
	 * mean what it says, and the workers are saturated by one run anyway.
	 *
	 * @param items Elements to process.
	 * @param runOptions Cancellation and transfers.
	 * @returns The results, in completion order, each tagged with its position.
	 */
	const process = async function* (
		items: Iterable<T>,
		runOptions?: RunOptions,
	): AsyncIterable<{ position: number; value: R }> {
		const queued: Promise<void> = inProgress;

		// Callable from the start, so that the `finally` below has nothing to
		// check: the slot is filled synchronously by the executor on the next
		// line, and a run that somehow released before taking its turn would
		// release nothing rather than throw inside a cleanup block.
		let release = (): void => undefined;

		inProgress = new Promise<void>((resolve) => {
			release = resolve;
		});

		try {
			await queued;

			yield* run(items, runOptions);
		} finally {
			release();
		}
	};

	return {
		map: async (items, runOptions): Promise<R[]> => {
			const collected: R[] = [];

			for await (const { position, value } of process(items, runOptions)) {
				collected[position] = value;
			}

			return collected;
		},

		stream: (items, runOptions): AsyncIterable<R> => ({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				for await (const { value } of process(items, runOptions)) yield value;
			},
		}),

		close: async (): Promise<void> => {
			const starting: Promise<Member[]> | null = members;

			if (starting === null) return;

			members = null;

			// A start that failed has already terminated what it managed to spawn,
			// and reported its cause to the run that was waiting for it. Closing
			// is not the place to raise it a second time.
			const running: Member[] = await starting.catch((): Member[] => []);

			await Promise.all(running.map((member) => member.handle.terminate()));
		},
	};
};
