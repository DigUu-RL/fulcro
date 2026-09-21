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
 * A `stream` therefore holds the pool until it is finished or abandoned.
 */
export interface WorkerPool<T, R> {
	/**
	 * Runs every element through the workers and collects the results.
	 *
	 * Results come back in the order the elements went in, whatever order the
	 * workers finished them in.
	 *
	 * @param items Elements to process.
	 * @param options Cancellation and transfers.
	 * @returns A promise of the results, in input order.
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
	 * @returns The results, in completion order.
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
	 * @returns A promise settling when every worker is gone.
	 */
	readonly close: () => Promise<void>;
}
