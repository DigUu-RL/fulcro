/**
 * The script every worker runs.
 *
 * It is deliberately tiny and knows nothing about the work: it is told which
 * module to import and which export to call, imports it once, and then answers
 * task messages until it is terminated. Everything specific to a job lives in
 * the consumer's own module, which is the only thing that can cross a realm
 * boundary intact.
 *
 * Written to speak both dialects. A browser worker receives messages through
 * `self.onmessage` and replies with `self.postMessage`; a Node worker uses the
 * `parentPort` it was handed. The shape of the protocol is identical, so the
 * difference is a handful of lines here rather than two implementations.
 */

/** What the pool sends first, before any work. */
interface InitMessage {
	readonly kind: 'init';
	readonly module: string;
	readonly export: string;
}

/** One element to process. */
interface TaskMessage {
	readonly kind: 'task';
	readonly id: number;
	readonly value: unknown;
}

/** What the pool sends. */
type Incoming = InitMessage | TaskMessage;

/** The function this worker was told to call. */
let task: ((value: unknown) => unknown) | null = null;

/** Sends a message back to the pool. */
let reply: (message: unknown) => void = () => {};

/**
 * Loads the module and finds the export the pool asked for.
 *
 * @param message What the pool sent.
 * @throws {Error} When the module has no such export, or it is not callable.
 */
const initialize = async (message: InitMessage): Promise<void> => {
	const loaded: Record<string, unknown> = (await import(
		message.module
	)) as Record<string, unknown>;

	const found: unknown = loaded[message.export];

	if (typeof found !== 'function') {
		throw new Error(
			`${message.module} has no callable export named "${message.export}".`,
		);
	}

	task = found as (value: unknown) => unknown;
};

/**
 * Runs one element and reports the outcome.
 *
 * A failure is sent back as a value rather than thrown, so the pool can attach
 * it to the element it belongs to. Throwing here would surface as the worker
 * itself failing, and the pool could not tell which element caused it.
 *
 * @param message Element to process.
 */
const run = async (message: TaskMessage): Promise<void> => {
	if (task === null) {
		reply({
			kind: 'failed',
			id: message.id,
			error: 'The worker was given a task before it was initialised.',
		});

		return;
	}

	try {
		reply({ kind: 'done', id: message.id, value: await task(message.value) });
	} catch (error) {
		reply({
			kind: 'failed',
			id: message.id,
			// Serialised here: an Error survives a structured clone, but a custom
			// one loses its prototype, and its message is what a caller reads.
			error: error instanceof Error ? error.message : String(error),
		});
	}
};

/**
 * Handles anything the pool sends.
 *
 * @param message What the pool sent.
 */
const receive = async (message: Incoming): Promise<void> => {
	if (message.kind === 'init') {
		try {
			await initialize(message);
			reply({ kind: 'ready' });
		} catch (error) {
			reply({
				kind: 'broken',
				error: error instanceof Error ? error.message : String(error),
			});
		}

		return;
	}

	await run(message);
};

/** Wires the worker to whichever messaging the runtime provides. */
const listen = async (): Promise<void> => {
	// A browser worker. `self` is the global scope, and there is no
	// `parentPort` to import.
	if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
		reply = (message: unknown): void => {
			self.postMessage(message);
		};

		self.addEventListener('message', (event: MessageEvent) => {
			void receive(event.data as Incoming);
		});

		return;
	}

	const { parentPort } = await import('node:worker_threads');

	if (parentPort === null) {
		throw new Error('This module is only meaningful inside a worker.');
	}

	reply = (message: unknown): void => {
		parentPort.postMessage(message);
	};

	parentPort.on('message', (message: Incoming) => {
		void receive(message);
	});
};

await listen();
