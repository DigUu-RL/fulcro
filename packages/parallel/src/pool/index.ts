import { createError, type DetailsOf, type ErrorCode } from '@fulcro/errors';

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

/**
 * A failure as it crosses the boundary: one of this package's own, as its code
 * and its details, or somebody else's, as the text it had.
 */
type Failure =
	| { readonly code: ErrorCode; readonly details: DetailsOf<ErrorCode> }
	| { readonly error: string };

/** What a worker sends back. */
type Outgoing =
	| { readonly kind: 'ready' }
	| ({ readonly kind: 'broken' } & Failure)
	| { readonly kind: 'done'; readonly id: number; readonly value: unknown }
	| ({ readonly kind: 'failed'; readonly id: number } & Failure);

/**
 * Creates, on this side, the error a worker reported.
 *
 * @param failure What the worker sent.
 * @param foreign The code that says where somebody else's failure happened —
 * loading the task module, or running the task.
 * @returns The error.
 */
const errorFrom = (
	failure: Failure,
	foreign: 'FULCRO3004' | 'FULCRO3005',
): Error => {
	if ('error' in failure) {
		return createError(foreign, {
			operation: foreign === 'FULCRO3004' ? 'initialize' : 'run',
			reason: failure.error,
		});
	}

	// The worker chose the code and its details together, from the same
	// catalog, so they match; the compiler cannot see that across a message.
	const create = createError as (
		code: ErrorCode,
		details: DetailsOf<ErrorCode>,
	) => Error;

	return create(failure.code, failure.details);
};

/** A worker and what it is currently doing. */
interface Member {
	readonly handle: WorkerHandle;

	/** The element it is working on, if any. */
	busyWith: number | null;

	/**
	 * False once the worker has failed or exited, whether or not a run was
	 * listening at the time.
	 */
	alive: boolean;

	/** Removes the listener that keeps `alive` current. */
	readonly forget: () => void;
}

/**
 * Waits for a run's turn, unless its signal calls it off first.
 *
 * A run queued behind another one has registered nothing on its signal yet,
 * so without this an abort would reach it only when the run ahead finished —
 * which, behind a long stream, is the whole of that stream.
 *
 * @param queued Settles when the run ahead has finished.
 * @param signal Signal calling this run off.
 * @returns A promise settling when it is this run's turn, or rejecting with
 * the abort reason.
 */
const turnAfter = (
	queued: Promise<void>,
	signal: AbortSignal | undefined,
): Promise<void> => {
	if (signal === undefined) return queued;

	return new Promise<void>((resolve, reject) => {
		const onAbort = (): void => {
			reject(signal.reason);
		};

		if (signal.aborted) {
			onAbort();
			return;
		}

		signal.addEventListener('abort', onAbort, { once: true });

		void queued.then(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		});
	});
};

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
		throw createError('FULCRO3003', {
			operation: 'createPool',
			workers: options.workers,
		});
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
	 * Whether `close` has been called. A closed pool stays closed: a run that
	 * was waiting for its turn when the pool closed would otherwise start a
	 * fresh set of threads after `close` had already promised they were gone.
	 */
	let closed = false;

	/** The close in progress or finished, which a second call shares. */
	let closing: Promise<void> | null = null;

	/** Terminations still in progress, which `close` waits for as well. */
	const retiring = new Set<Promise<void>>();

	/**
	 * Terminates workers the pool is finished with.
	 *
	 * `allSettled` rather than `all`: this runs while a run is already throwing
	 * the abort or the failure the caller is waiting to read, and a worker that
	 * also fails to terminate must not replace it.
	 *
	 * @param retired The workers to stop.
	 * @returns A promise settling when every one of them has been told to stop.
	 */
	const retire = (retired: readonly Member[]): Promise<void> => {
		const stopping: Promise<void> = Promise.allSettled(
			retired.map((member) => member.handle.terminate()),
		).then(() => {
			for (const member of retired) member.forget();
		});

		retiring.add(stopping);

		void stopping.then(() => retiring.delete(stopping));

		return stopping;
	};

	/**
	 * Starts one worker, with a listener kept for as long as the worker is.
	 *
	 * A run listens only while it runs, and a worker can fail between runs: on
	 * Node an error with nobody listening is thrown in the main thread and ends
	 * the process, and a worker that exited unseen would take the next run's
	 * element and never answer. This listener is what makes both visible.
	 *
	 * @returns The worker, not yet initialised.
	 */
	const enlist = (): Member => {
		const handle: WorkerHandle = spawn(workerUrl);

		const member: Member = {
			handle,
			busyWith: null,
			alive: true,
			forget: handle.listen((_message, failure) => {
				if (failure !== undefined) member.alive = false;
			}),
		};

		return member;
	};

	/**
	 * Spawns a full set of workers and waits for each to load the task module.
	 *
	 * Every worker is told what to import once, rather than per element.
	 *
	 * @returns The members, once every one has loaded the task module.
	 */
	const start = async (): Promise<Member[]> => {
		const started: Member[] = Array.from({ length: size }, enlist);

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
									if (reply.kind === 'broken') {
										reject(errorFrom(reply, 'FULCRO3004'));
									}
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
			// never finished being built. The load failure is the cause the
			// caller needs, which is why `retire` settles rather than throws.
			members = null;

			await retire(started);

			throw error;
		} finally {
			for (const stop of stops) stop();
		}

		return started;
	};

	/**
	 * The workers a run is to use, started if there are none.
	 *
	 * Deferred to the first run, so a pool nobody uses costs no threads. A set
	 * with a worker that died since the last run is replaced rather than reused.
	 *
	 * @param operation The call the run came from, for the error a closed pool
	 * gives.
	 * @returns The members, ready for work.
	 * @throws {Error} FULCRO3010 when the pool was closed.
	 */
	const ready = async (operation: string): Promise<Member[]> => {
		const refuse = (): Error => createError('FULCRO3010', { operation });

		if (closed) throw refuse();

		const current: Promise<Member[]> | null = members;

		if (current !== null) {
			const running: Member[] = await current;

			if (closed) throw refuse();
			if (running.every((member) => member.alive)) return running;

			if (members === current) members = null;

			await retire(running);

			if (closed) throw refuse();
		}

		const starting: Promise<Member[]> = start();

		members = starting;

		const started: Member[] = await starting;

		// A close that arrived during the handshake has terminated these
		// already, and a run handed them would wait on threads that are gone.
		if (closed) throw refuse();

		return started;
	};

	/** The run in progress, which the next one waits for. */
	let inProgress: Promise<void> = Promise.resolve();

	/**
	 * Runs every element, yielding each result as its worker finishes it.
	 *
	 * @param items Elements to process.
	 * @param runOptions Cancellation and transfers.
	 * @param operation The call the run came from.
	 * @returns The results, in completion order, each tagged with its position.
	 */
	const run = async function* (
		items: Iterable<T>,
		runOptions: RunOptions | undefined,
		operation: string,
	): AsyncIterable<{ position: number; value: R }> {
		const signal: AbortSignal | undefined = runOptions?.signal;

		// Before anything is started, so that a run called off in advance hands
		// out no elements at all rather than posting them and terminating the
		// workers that took them.
		signal?.throwIfAborted();

		const pool: Member[] = await ready(operation);
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
					failure ??= { error: errorFrom(reply, 'FULCRO3005') };
					member.busyWith = null;
					outstanding.delete(reply.id);
					notify();
				}
			}),
		);

		/** The termination of this run's workers, once one has begun. */
		let discarding: Promise<void> | null = null;

		/**
		 * Gives up every worker of this run.
		 *
		 * A worker cannot be asked to stop mid-task, only terminated. So a run
		 * that ends while elements are still out — aborted, failed, or simply
		 * abandoned by its consumer — discards the whole pool rather than handing
		 * the next run a worker still busy with something nobody is waiting for.
		 * The next run builds a fresh one, and the cost of that is paid only by a
		 * run that did not finish.
		 *
		 * @returns A promise settling when every worker has been told to stop.
		 */
		const discard = (): Promise<void> => {
			if (discarding === null) {
				members = null;
				outstanding.clear();
				discarding = retire(pool);
			}

			return discarding;
		};

		// An abort is not a reply, so nothing else would wake the loop: a run
		// whose workers are all busy would learn it had been called off only when
		// one of them finished on its own, which is the whole duration the pool
		// exists to spend. And a stream whose consumer is busy with the last
		// result is not waiting to be woken at all, so the workers are stopped
		// here rather than on the consumer's next pull, which may never come.
		const onAbort = (): void => {
			if (outstanding.size > 0) void discard();

			notify();
		};

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

			if (outstanding.size > 0 || discarding !== null) await discard();
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
	 * @param operation The call the run came from.
	 * @returns The results, in completion order, each tagged with its position.
	 */
	const process = async function* (
		items: Iterable<T>,
		runOptions: RunOptions | undefined,
		operation: string,
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
			await turnAfter(queued, runOptions?.signal);

			yield* run(items, runOptions, operation);
		} finally {
			// After the run ahead as well as after this one: a run called off
			// while still queued gives up its place, and the run behind it must
			// not overtake the run that is still going.
			void queued.then(release);
		}
	};

	const close = (): Promise<void> => {
		closing ??= (async (): Promise<void> => {
			closed = true;

			const starting: Promise<Member[]> | null = members;

			members = null;

			if (starting !== null) {
				// A start that failed has already terminated what it managed to
				// spawn, and reported its cause to the run that was waiting for it.
				// Closing is not the place to raise it a second time.
				const running: Member[] = await starting.catch((): Member[] => []);

				try {
					await Promise.all(running.map((member) => member.handle.terminate()));
				} finally {
					for (const member of running) member.forget();
				}
			}

			// A run that gave its workers up — aborted, or failed with elements
			// still out — may still be terminating them, and `close` promises
			// that every worker is gone when it settles.
			await Promise.all([...retiring]);
		})();

		return closing;
	};

	return {
		map: async (items, runOptions): Promise<R[]> => {
			const collected: R[] = [];

			for await (const { position, value } of process(
				items,
				runOptions,
				'map',
			)) {
				collected[position] = value;
			}

			return collected;
		},

		stream: (items, runOptions): AsyncIterable<R> => ({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				for await (const { value } of process(items, runOptions, 'stream')) {
					yield value;
				}
			},
		}),

		close,

		[Symbol.asyncDispose]: close,
	};
};
