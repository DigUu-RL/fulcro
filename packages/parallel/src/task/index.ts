import { createError } from '@fulcro/errors';
import { type Result, tryCatch } from '@fulcro/functions';

import {
	CancellationSource,
	CancellationToken,
	Task,
	TaskScope,
	TaskScopeOptions,
	TaskWork,
} from '@/@types/index.js';
import { createCancellationSource } from '@/cancellation/index.js';
import {
	createWaitingQueue,
	type Waiting,
	type WaitingQueue,
} from '@/task/queue.js';

/**
 * What a task rejects with, made safe to hold as a failure.
 *
 * A rejection with `null` or `undefined` cannot be told apart from no failure
 * at all, and as the reason for calling the siblings off it would become the
 * platform's `AbortError` — so `join`, disposal and `settled` would each
 * report the same failure differently. It is replaced once, here, by an error
 * that says what happened, and every one of them reports that.
 *
 * @param thrown What the work rejected with.
 * @returns The value itself, or FULCRO3013 standing in for a nullish one.
 */
const asFailure = (thrown: unknown): NonNullable<unknown> =>
	thrown ??
	createError('FULCRO3013', {
		operation: 'spawn',
		thrown: thrown as null | undefined,
	});

/**
 * Creates a scope that tasks start in and that ends only when they all have.
 *
 * ```ts
 * await using scope = createTaskScope({ concurrency: 8 });
 *
 * for (const id of ids) scope.spawn((token) => loadUser(id, token.signal));
 *
 * await scope.join();
 * ```
 *
 * For work that waits — requests, queries, files. Every task runs on the
 * calling thread, so this overlaps waiting and does nothing for computing; a
 * {@link WorkerPool} is the tool for that, and a task can drive one by passing
 * it `token.signal`.
 *
 * @param options The concurrency limit, and a cancellation to follow.
 * @returns The scope.
 * @throws {RangeError} FULCRO3012 when `concurrency` is neither a positive
 * integer nor `Infinity`.
 */
export const createTaskScope = (options: TaskScopeOptions = {}): TaskScope => {
	const limit: number = options.concurrency ?? Number.POSITIVE_INFINITY;

	if (
		limit !== Number.POSITIVE_INFINITY &&
		!(Number.isInteger(limit) && limit >= 1)
	) {
		throw createError('FULCRO3012', {
			operation: 'createTaskScope',
			concurrency: limit,
		});
	}

	const source: CancellationSource = createCancellationSource(options.token);

	/** Tasks whose work has begun and not yet settled. */
	let running = 0;

	/** Tasks spawned and not yet settled, whether running or waiting. */
	let outstanding = 0;

	/** Tasks waiting for their turn, oldest first. */
	const waiting: WaitingQueue = createWaitingQueue();

	/** Callers waiting for `outstanding` to reach zero. */
	let idle: (() => void)[] = [];

	/** The first failure, which called the rest of the scope off. */
	let failure: { readonly error: unknown } | null = null;

	/** Whether `join` has already handed that failure to somebody. */
	let reported = false;

	/** Whether the scope refuses new tasks. */
	let closed = false;

	/** The wait for every task, which `join` and disposal share. */
	let ending: Promise<void> | null = null;

	/** Starts waiting tasks while there is room under the limit. */
	const pump = (): void => {
		waiting.startWhile(() => running < limit);
	};

	/** Counts one task as settled, waking the callers waiting for none. */
	const settled = (): void => {
		outstanding--;

		if (outstanding > 0) return;

		const waking: (() => void)[] = idle;

		idle = [];

		for (const wake of waking) wake();
	};

	/**
	 * Waits for every task, then closes the scope and lets go of the parent
	 * token.
	 *
	 * The scope closes in the same synchronous step as the check that finds it
	 * empty. A step later — a `.then` after the wait — is too late: code resumed
	 * by the last task settling runs in between, and a task it spawned there was
	 * accepted by a scope whose `join` had already stopped waiting.
	 * The parent is released here rather than only on disposal, because a scope
	 * that is joined and never disposed would otherwise leave one listener per
	 * scope on a parent that may live for the whole process.
	 *
	 * @returns A promise settling once the scope is empty and closed.
	 */
	const end = (): Promise<void> => {
		ending ??= (async (): Promise<void> => {
			while (outstanding > 0) {
				await new Promise<void>((wake) => {
					idle.push(wake);
				});
			}

			closed = true;
			source[Symbol.dispose]();
		})();

		return ending;
	};

	const spawn = <T>(work: TaskWork<T>): Task<T> => {
		if (closed) throw createError('FULCRO3011', { operation: 'spawn' });

		const own: CancellationSource = createCancellationSource(source.token);
		const token: CancellationToken = own.token;

		const {
			promise: outcome,
			resolve,
			reject,
		}: PromiseWithResolvers<T> = Promise.withResolvers<T>();

		// Reading the outcome as a `Result` is also what handles it, so a task
		// nobody awaits is never an unhandled rejection. Its failure is not lost:
		// the scope holds it for `join` and for disposal.
		const outcomeAsResult: Promise<Result<T, unknown>> = tryCatch<T>(outcome);

		/**
		 * Ends the task, releasing its hold on the scope's cancellation.
		 *
		 * Released on every path: a scope that runs ten thousand tasks would
		 * otherwise keep ten thousand listeners on its signal until it ended.
		 */
		const finish = (): void => {
			own[Symbol.dispose]();
			settled();
		};

		/** Runs the work, which has been given its turn. */
		const begin = (): void => {
			// Counted before the work begins rather than when it does, so the
			// limit holds against the tasks this same loop starts next.
			running++;

			queueMicrotask(() => {
				// Called off between being started and the work beginning —
				// `spawn` then `cancel` in one breath. It has not run, so it
				// never does.
				const producing: Promise<T> = token.isCancelled
					? Promise.reject(token.reason)
					: new Promise<T>((onValue) => {
							onValue(work(token));
						});

				void producing
					.then(
						(value: T) => {
							resolve(value);
						},
						(thrown: unknown) => {
							const error: NonNullable<unknown> = asFailure(thrown);

							// After a cancellation, the rejection is the work
							// answering it. Only a task nobody called off can fail
							// the scope, and its error is the reason every other
							// task is called off with.
							if (!token.isCancelled && failure === null) {
								failure = { error };
								source.cancel(error);
							}

							reject(error);
						},
					)
					.finally(() => {
						running--;
						pump();
						finish();
					});
			});
		};

		const entry: Waiting = { start: null };

		// A waiting task called off gives its place up at once rather than when
		// its turn would have come, which behind a long queue is never.
		const registration: Disposable = token.onCancelled((reason) => {
			if (entry.start === null) return;

			entry.start = null;
			reject(reason);
			finish();
		});

		entry.start = (): void => {
			registration[Symbol.dispose]();
			begin();
		};

		outstanding++;

		// Every task joins the back of the queue, even one that could start at
		// once: a task spawned while others wait would otherwise overtake them.
		waiting.push(entry);
		pump();

		return Object.freeze({
			then: <TResult1 = T, TResult2 = never>(
				onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
				onRejected?:
					((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
			): PromiseLike<TResult1 | TResult2> =>
				outcome.then(onFulfilled, onRejected),
			settled: outcomeAsResult,
			token,
			cancel: own.cancel,
		});
	};

	const join = async (): Promise<void> => {
		await end();

		reported = true;

		if (failure !== null) throw failure.error;

		source.token.throwIfCancelled();
	};

	const dispose = async (): Promise<void> => {
		if (outstanding > 0) source.cancel();

		await end();

		const unreported: { readonly error: unknown } | null = reported
			? null
			: failure;

		reported = true;

		if (unreported !== null) throw unreported.error;
	};

	return Object.freeze({
		token: source.token,
		spawn,
		join,
		cancel: source.cancel,
		[Symbol.asyncDispose]: dispose,
	});
};
