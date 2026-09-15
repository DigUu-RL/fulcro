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

	/** Workers, started on the first run rather than at construction. */
	let members: Member[] | null = null;

	/**
	 * Starts the workers and waits for each to load the task module.
	 *
	 * Deferred to the first run, so a pool nobody uses costs no threads. Every
	 * worker is told what to import once, rather than per element.
	 *
	 * @returns The members, ready for work.
	 */
	const ready = async (): Promise<Member[]> => {
		if (members !== null) return members;

		const started: Member[] = Array.from({ length: size }, () => ({
			handle: spawn(workerUrl),
			busyWith: null,
		}));

		await Promise.all(
			started.map(
				(member) =>
					new Promise<void>((resolve, reject) => {
						member.handle.listen((message, failure) => {
							if (failure !== undefined) {
								reject(failure);
								return;
							}

							const reply = message as Outgoing;

							if (reply.kind === 'ready') resolve();
							if (reply.kind === 'broken') reject(new Error(reply.error));
						});

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

		members = started;

		return started;
	};

	/**
	 * Runs every element, yielding each result as its worker finishes it.
	 *
	 * @param items Elements to process.
	 * @param runOptions Cancellation and transfers.
	 * @returns The results, in completion order, each tagged with its position.
	 */
	const process = async function* (
		items: Iterable<T>,
		runOptions?: RunOptions,
	): AsyncIterable<{ position: number; value: R }> {
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

		for (const member of pool) {
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
			});
		}

		/** Hands elements to whichever workers are free. */
		const dispatch = (): void => {
			for (const member of pool) {
				if (member.busyWith !== null) continue;
				if (handedOut >= pending.length) return;
				if (failed() !== null) return;

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

		dispatch();

		try {
			while (delivered < pending.length) {
				runOptions?.signal?.throwIfAborted();

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

				await Promise.all(discarded.map((member) => member.handle.terminate()));
			}
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
			if (members === null) return;

			const running: Member[] = members;

			members = null;

			await Promise.all(running.map((member) => member.handle.terminate()));
		},
	};
};
