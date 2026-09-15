/**
 * Entry point on Node, and the default anywhere the `browser` condition is not
 * applied.
 *
 * It is one of two: this file wires the `node:worker_threads` adapter into the
 * pool, and `browser.ts` wires the platform `Worker` into the same pool. The
 * `exports` map picks between them, so a browser bundle never contains a
 * reference to a Node built-in and nothing has to be marked external.
 */
import { PoolOptions, WorkerPool } from '@/@types/index.js';
import { spawnWorker } from '@/backend/node.js';
import { createPool } from '@/pool/index.js';

export type {
	PoolOptions,
	RunOptions,
	TaskSource,
	WorkerPool,
} from '@/@types/index.js';

/** The script the workers run, resolved relative to this module. */
const WORKER_URL = new URL('./worker/entry.js', import.meta.url);

/**
 * Creates a pool of workers over one named task.
 *
 * ```ts
 * const pool = createWorkerPool<Row, Parsed>({
 * 	module: new URL('./parse.js', import.meta.url),
 * 	export: 'parseRow',
 * });
 *
 * const parsed = await pool.map(rows);
 *
 * await pool.close();
 * ```
 *
 * Workers start on the first run rather than here, so a pool nobody uses costs
 * no threads. A pool that is finished with must be closed: threads keep a Node
 * process alive.
 *
 * @template T Type of the elements handed to the workers.
 * @template R Type the task produces.
 * @param options Where the work lives, and how many workers to run.
 * @returns The pool.
 * @throws {Error} When `workers` is not a positive integer.
 */
export const createWorkerPool = <T, R>(
	options: PoolOptions,
): WorkerPool<T, R> => createPool<T, R>(options, spawnWorker, WORKER_URL);
