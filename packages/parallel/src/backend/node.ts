import { Worker } from 'node:worker_threads';

import { SpawnWorker, WorkerHandle } from '@/@types/index.js';

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
		post: (message: unknown, transfer?: readonly Transferable[]): void => {
			// Node calls its transfer list `TransferListItem`, the browser calls it
			// `Transferable`. Same values, two names; the pool speaks the portable one.
			worker.postMessage(
				message,
				transfer as unknown as readonly ArrayBuffer[],
			);
		},

		listen: (handler): (() => void) => {
			const onMessage = (message: unknown): void => handler(message);

			// A worker that fails to load, or dies, arrives here rather than as a
			// message — and has to reach the pool, or a run waiting on it would
			// hang instead of rejecting.
			const onError = (failure: Error): void => handler(undefined, failure);

			const onExit = (code: number): void => {
				if (code !== 0) {
					handler(undefined, new Error(`The worker exited with code ${code}.`));
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
