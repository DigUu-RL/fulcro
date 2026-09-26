import { createError } from '@fulcro/errors';

import { SpawnWorker, WorkerHandle } from '@/@types/index.js';

/**
 * Starts workers with the platform `Worker`.
 *
 * The other of the two adapters, imported only by the browser entry point. It
 * differs from the Node one in exactly three places — the constructor, how a
 * message is read, and how a failure arrives — which is the whole of what is
 * not portable about threading.
 *
 * `{ type: 'module' }` is not optional: the worker script is an ES module, and
 * a classic worker cannot `import` the consumer's own module.
 *
 * @param url Module the worker runs.
 * @returns The worker.
 */
export const spawnWorker: SpawnWorker = (url: URL): WorkerHandle => {
	const worker = new Worker(url, { type: 'module' });

	return {
		post: (message: unknown, transfer?: readonly Transferable[]): void => {
			worker.postMessage(message, (transfer ?? []) as Transferable[]);
		},

		listen: (handler): (() => void) => {
			const onMessage = (event: MessageEvent): void => {
				handler(event.data);
			};

			const onError = (event: ErrorEvent): void => {
				handler(undefined, createError('FULCRO3008', event.message));
			};

			// A message the structured clone algorithm could not carry. Silent
			// otherwise, and it would leave a run waiting forever.
			const onMessageError = (): void => {
				handler(undefined, createError('FULCRO3009'));
			};

			worker.addEventListener('message', onMessage);
			worker.addEventListener('error', onError);
			worker.addEventListener('messageerror', onMessageError);

			return (): void => {
				worker.removeEventListener('message', onMessage);
				worker.removeEventListener('error', onError);
				worker.removeEventListener('messageerror', onMessageError);
			};
		},

		terminate: async (): Promise<void> => {
			worker.terminate();
		},
	};
};
