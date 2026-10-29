import { Worker } from 'node:worker_threads';

import { createError } from '@fulcro/errors';

import type { SpawnWorker, WorkerHandle } from '@/src/@types/index.js';

/**
 * Starts workers with `node:worker_threads`.
 *
 * One of the two adapters. It is imported only by the Node entry point, so a
 * browser bundle never contains a reference to `node:worker_threads` and
 * nothing has to be marked external.
 *
 * @param url Module the worker runs.
 * @returns The worker.
 */
export const spawnWorker: SpawnWorker = (url: URL): WorkerHandle => {
	const worker = new Worker(url);

	return {
		post: (message: unknown, transfer?: readonly object[]): void => {
			// The pool takes any object to transfer; Node's own list is what
			// `postMessage` checks it against. Named through `postMessage` itself,
			// because `@types/node` has renamed that list between majors.
			worker.postMessage(message, transfer as Parameters<Worker['postMessage']>[1]);
		},

		listen: (handler): (() => void) => {
			const onMessage = (message: unknown): void => {
				handler(message);
			};

			// A worker that fails to load, or dies, arrives here rather than as a
			// message — and has to reach the pool, or a run waiting on it would
			// hang instead of rejecting.
			const onError = (failure: Error): void => {
				handler(undefined, failure);
			};

			const onExit = (code: number): void => {
				if (code !== 0) {
					handler(
						undefined,
						createError('FULCRO3007', {
							operation: 'spawnWorker',
							exitCode: code,
						}),
					);
				}
			};

			worker.on('message', onMessage);
			worker.on('error', onError);
			worker.on('exit', onExit);

			return (): void => {
				worker.off('message', onMessage);
				worker.off('error', onError);
				worker.off('exit', onExit);
			};
		},

		terminate: async (): Promise<void> => {
			await worker.terminate();
		},
	};
};
