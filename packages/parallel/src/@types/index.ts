import type { Result } from '@fulcro/functions';

/**
 * Where the work lives.
 *
 * A worker is a separate JavaScript realm, and a function cannot cross into
 * one: its captured scope is not serialisable, so anything it closed over would
 * be left behind. Libraries that appear to accept a closure either stringify it
 * and lose that scope in silence, or re-import the calling module and hope it
 * has no side effects.
 *
 * So the work is *named* rather than captured. A module boundary is a thing
 * that genuinely crosses realms, and this is one.
 */
export interface TaskSource {
	/**
	 * Module holding the function.
	 *
	 * Written as `new URL('./work.js', import.meta.url)`, which is the form
	 * every major bundler recognises as a worker entry and rewrites to the
	 * emitted asset. A bare string path works on Node and breaks the moment a
	 * browser build moves a file.
	 */
	readonly module: URL | string;

	/**
	 * Name of the exported function to call.
	 *
	 * It takes one element and returns the result, or a promise of it.
	 */
	readonly export: string;
}

/** How a pool is built. */
export interface PoolOptions extends TaskSource {
	/**
	 * How many workers to run.
	 *
	 * Defaults to `navigator.hardwareConcurrency`, which both the browser and
	 * Node report, and to `4` where neither does. More workers than cores does
	 * not help work that is already CPU-bound; it only adds scheduling.
	 */
	readonly workers?: number;
}

/** How one run over a set of elements behaves. */
export interface RunOptions {
	/**
	 * Signal calling the run off.
	 *
	 * Aborting stops handing out new elements and rejects. Unlike a promise,
	 * a worker genuinely *can* be stopped — but the one holding an element is
	 * terminated rather than interrupted, so its element produces no result.
	 * A run still waiting for its turn rejects at once and gives its place up.
	 */
	readonly signal?: AbortSignal;

	/**
	 * Values transferred rather than copied, per element.
	 *
	 * Everything crossing a thread boundary is structure-cloned, which is a
	 * real copy proportional to size. An `ArrayBuffer` listed here has its
	 * ownership moved instead — no copy, but the sending side can no longer
	 * read it. For large binary payloads that is the difference between
	 * worthwhile and not.
	 *
	 * @param value Element about to be sent.
	 * @returns The buffers to transfer along with it.
	 */
	readonly transfer?: (value: unknown) => readonly Transferable[];
}

/** A worker as the pool needs to see it, whatever runtime it came from. */
export interface WorkerHandle {
	/**
	 * Sends a message to the worker.
	 *
	 * @param message Message to send.
	 * @param transfer Values whose ownership moves rather than being copied.
	 */
	readonly post: (message: unknown, transfer?: readonly Transferable[]) => void;

	/**
	 * Registers what to do with what comes back.
	 *
	 * A run registers its handlers and removes them again when it ends, so a
	 * pool reused across batches does not accumulate one set per batch — which
	 * keeps each run's buffers alive and, on Node, trips the listener warning
	 * after ten of them.
	 *
	 * @param handler Called with each message, or with a failure of the worker
	 * itself.
	 * @returns A function removing the handler.
	 */
	readonly listen: (
		handler: (message: unknown, failure?: unknown) => void,
	) => () => void;

	/** Stops the worker, discarding whatever it was doing. */
	readonly terminate: () => Promise<void>;
}

/**
 * Starts a worker for the runtime in hand.
 *
 * The one thing that genuinely differs between the browser and Node — the
 * construction and how messages are read. Everything else the pool does is the
 * same on both, which is why this is the only seam.
 *
 * @param url Module the worker runs.
 * @returns The worker.
 */
export type SpawnWorker = (url: URL) => WorkerHandle;

/**
 * A pool of workers, over one named task.
 *
 * Runs are serialised: a second `map` or `stream` started while one is still
 * going waits for it rather than sharing the workers with it. The alternative
 * is routing every reply back to the run that asked for it, which buys
 * throughput a pool this size does not have — the workers are already
 * saturated by one run — at the cost of a run identity in every message.
 *
 * A `stream` therefore holds the pool until it is finished or returned: a
 * `for await` returns it on `break` or on a throw, but an iterator taken by
 * hand and dropped without calling `return()` holds it for good.
 *
 * A task that fails rejects the run with its error and terminates the
 * elements still in flight with it; the next run starts a fresh set of
 * workers. So does a run after a worker died between runs.
 *
 * Declared with `await using`, the pool closes when the scope ends, however
 * the scope is left:
 *
 * ```ts
 * {
 * 	await using pool = createWorkerPool<number, number>({ module, export: 'square' });
 * 	const squares = await pool.map([1, 2, 3]);
 * } // every worker is stopped here
 * ```
 */
export interface WorkerPool<T, R> extends AsyncDisposable {
	/**
	 * Runs every element through the workers and collects the results.
	 *
	 * Results come back in the order the elements went in, whatever order the
	 * workers finished them in.
	 *
	 * @param items Elements to process.
	 * @param options Cancellation and transfers.
	 * @returns A promise of the results, in input order. It rejects with
	 * FULCRO3010 once the pool is closed.
	 */
	readonly map: (items: Iterable<T>, options?: RunOptions) => Promise<R[]>;

	/**
	 * Runs every element through the workers, yielding each as it is done.
	 *
	 * An `AsyncIterable`, so it drops straight into
	 * `AsyncSequenceCollection.from` for anyone using the sequences — without
	 * this package depending on them.
	 *
	 * @param items Elements to process.
	 * @param options Cancellation and transfers.
	 * @returns The results, in completion order. Reading them rejects with
	 * FULCRO3010 once the pool is closed.
	 */
	readonly stream: (
		items: Iterable<T>,
		options?: RunOptions,
	) => AsyncIterable<R>;

	/**
	 * Stops every worker.
	 *
	 * A pool holds threads, which keep a Node process alive until they are
	 * stopped. Always close a pool you are finished with.
	 *
	 * A closed pool stays closed: every run started afterwards, and every run
	 * still waiting for its turn, rejects with FULCRO3010 and starts no
	 * thread. A second call shares the first one's promise.
	 *
	 * @returns A promise settling when every worker is gone, including those
	 * a run that was called off is still terminating.
	 */
	readonly close: () => Promise<void>;

	/**
	 * Stops every worker, exactly as `close` does. Called by `await using` when
	 * the scope ends; closing a pool already closed does nothing.
	 *
	 * @returns A promise settling when every worker is gone.
	 */
	[Symbol.asyncDispose](): Promise<void>;
}

/**
 * The side of a cancellation that work reads: whether it has been called off,
 * and why.
 *
 * Work receives a token and never the source behind it, so the code that
 * started something is the only code that can stop it.
 *
 * The token carries the platform's `AbortSignal` rather than replacing it.
 * `fetch`, timers, streams and a {@link WorkerPool} run all accept a signal,
 * and `token.signal` hands them this cancellation with nothing to adapt.
 */
export interface CancellationToken {
	/** Whether the work has been called off. Once true, it stays true. */
	readonly isCancelled: boolean;

	/**
	 * Why the work was called off: the value given to `cancel`, or an
	 * `AbortError` `DOMException` when it was given none. `undefined` while the
	 * work is still wanted.
	 */
	readonly reason: unknown;

	/** The same cancellation, as a signal the platform's own APIs accept. */
	readonly signal: AbortSignal;

	/**
	 * Throws the reason if the work has been called off, and does nothing
	 * otherwise.
	 *
	 * The check a loop makes between steps, so that work which never awaits
	 * anything still stops at the next step rather than at the end.
	 *
	 * @throws {unknown} The reason, once the work has been called off.
	 */
	readonly throwIfCancelled: () => void;

	/**
	 * Registers what to do when the work is called off.
	 *
	 * Called at most once. When the work has already been called off it is
	 * called at once, before this returns, so registering late never misses
	 * the cancellation it came for.
	 *
	 * Release what the handler holds by disposing what this returns — with
	 * `using`, or by hand. A long-lived token otherwise keeps every handler
	 * ever registered on it, along with whatever each one closed over.
	 *
	 * @param handler Called with the reason.
	 * @returns A registration that removes the handler when disposed.
	 */
	readonly onCancelled: (handler: (reason: unknown) => void) => Disposable;
}

/**
 * The side of a cancellation that calls the work off.
 *
 * Kept by whoever started the work; the {@link CancellationToken} is what is
 * handed on. A source made under a parent token is cancelled with it, and
 * disposing the source releases its hold on that parent:
 *
 * ```ts
 * using child = createCancellationSource(parent);
 * await download(url, child.token);
 * ```
 */
export interface CancellationSource extends Disposable {
	/** The token to hand to the work. */
	readonly token: CancellationToken;

	/**
	 * Calls the work off.
	 *
	 * Only the first call counts; a later one, with whatever reason, does
	 * nothing. Handlers registered on the token run before this returns.
	 *
	 * @param reason Why. Without one, the token reports an `AbortError`
	 * `DOMException`, as an aborted signal does.
	 */
	readonly cancel: (reason?: unknown) => void;

	/**
	 * Stops following the parent token. Called by `using` when the scope ends.
	 *
	 * The source is not cancelled by this, and the parent keeps nothing of it
	 * afterwards: a parent that lives for the whole process would otherwise
	 * hold every child ever made under it.
	 */
	[Symbol.dispose](): void;
}

/**
 * Work handed to a {@link TaskScope}.
 *
 * Usually waiting rather than computing — a request, a query, a file. A task
 * runs on the calling thread and never on a worker; CPU-bound work belongs to a
 * {@link WorkerPool}, which a task can drive with `token.signal`.
 *
 * @template T Type the work produces.
 * @param token Says when the work has been called off. Pass `token.signal` to
 * whatever accepts one.
 * @returns What the work produces, or a promise of it.
 */
export type TaskWork<T> = (token: CancellationToken) => T | PromiseLike<T>;

/**
 * One piece of work running inside a {@link TaskScope}.
 *
 * Awaited directly, a task gives its value or throws its failure. `settled`
 * gives the same outcome as a `Result`, for a caller that wants to read a
 * failure as a value.
 *
 * A task nobody awaits cannot end the process: its failure reaches the scope,
 * which reports it from `join`, or when the scope is disposed.
 *
 * @template T Type the work produces.
 */
export interface Task<T> extends PromiseLike<T> {
	/**
	 * The outcome, which never rejects: a success with the value, or a failure
	 * with what the work threw — or with the reason, when the task was called
	 * off.
	 */
	readonly settled: Promise<Result<T, unknown>>;

	/** Says when this task has been called off, by itself or by its scope. */
	readonly token: CancellationToken;

	/**
	 * Calls this task off, and only this task.
	 *
	 * A task still waiting for its turn never starts. A running one is told
	 * through its token, and its rejection afterwards counts as a cancellation,
	 * not as a failure of the scope — its siblings carry on.
	 *
	 * "Afterwards" is when the scope reads the rejection, a microtask after the
	 * work rejected: a call landing in between turns a failure into a
	 * cancellation. Nothing can tell the two orders apart, because a promise
	 * says that it rejected and never when.
	 *
	 * @param reason Why. Without one, an `AbortError` `DOMException`.
	 */
	readonly cancel: (reason?: unknown) => void;
}

/** How a {@link TaskScope} is built. */
export interface TaskScopeOptions {
	/**
	 * How many tasks may run at once.
	 *
	 * A task spawned beyond the limit waits, unstarted, for one to finish, so
	 * ten thousand requests can be spawned at once and only this many are ever
	 * in flight. A waiting task has started nothing: it holds only what it
	 * needs to start, or to be called off. Defaults to no limit.
	 *
	 * The limit speeds up nothing CPU-bound: every task shares the one thread,
	 * and spreading that work across cores is what a {@link WorkerPool} does.
	 */
	readonly concurrency?: number;

	/**
	 * A cancellation the scope follows: when it is called off, so is every
	 * task in the scope.
	 */
	readonly token?: CancellationToken;
}

/**
 * Tasks that start together and end together.
 *
 * No task outlives its scope. Declared with `await using`, the scope waits for
 * every task when it ends, calling off the ones still running:
 *
 * ```ts
 * await using scope = createTaskScope({ concurrency: 8 });
 *
 * const pages = urls.map((url) =>
 * 	scope.spawn((token) => fetch(url, { signal: token.signal })),
 * );
 *
 * await scope.join();
 * ```
 *
 * The first task to fail calls every other task off: the running ones are
 * told through their tokens, and the waiting ones never start. `join` then
 * rejects with that failure. A task called off on its own, with
 * `task.cancel()`, is not a failure and affects nothing else.
 */
export interface TaskScope extends AsyncDisposable {
	/** Says when the scope has been called off; every task's token follows it. */
	readonly token: CancellationToken;

	/**
	 * Starts a task in the scope, or queues it when the scope is at its
	 * concurrency limit.
	 *
	 * The work starts on a later microtask, never during this call. In a scope
	 * already called off it never starts, and the task rejects with the reason.
	 *
	 * @template T Type the work produces.
	 * @param work The work, handed its task's token.
	 * @returns The task.
	 * @throws {Error} FULCRO3011 once the scope has been joined or disposed.
	 */
	readonly spawn: <T>(work: TaskWork<T>) => Task<T>;

	/**
	 * Waits for every task, including those spawned while waiting, then closes
	 * the scope to new ones and lets go of the parent token, if it had one.
	 *
	 * @returns A promise settling once every task has. It rejects with the
	 * first failure, or with the reason when the scope was called off.
	 */
	readonly join: () => Promise<void>;

	/**
	 * Calls every task in the scope off.
	 *
	 * Only the first call counts.
	 *
	 * @param reason Why. Without one, an `AbortError` `DOMException`.
	 */
	readonly cancel: (reason?: unknown) => void;

	/**
	 * Calls off what is still running, waits for every task and closes the
	 * scope. Called by `await using` when the scope ends.
	 *
	 * A failure `join` has not already reported is thrown here, so a task that
	 * failed is never silent because nobody joined.
	 *
	 * @returns A promise settling once every task has.
	 */
	[Symbol.asyncDispose](): Promise<void>;
}
