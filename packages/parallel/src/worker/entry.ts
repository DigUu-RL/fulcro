import { createError, type ErrorCode } from '@fulcro/errors';

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
 *
 * A failure of its own is reported as a code and the values of its message,
 * never as a thrown error: only text survives the boundary, and the pool needs
 * the values to create the same error again on its side, class and code
 * included.
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

/** One of this package's own errors, as it crosses to the pool. */
interface CodedFailure {
	readonly code: ErrorCode;
	readonly values: readonly unknown[];
}

/**
 * Describes what somebody else's code threw — the task module failing to
 * load, or the task itself.
 *
 * Serialised here: an Error survives a structured clone, but a custom one
 * loses its prototype, and its message is what a caller reads.
 *
 * @param error The thrown value.
 * @returns Its text.
 */
const describeForeign = (error: unknown): { readonly error: string } => ({
	error: error instanceof Error ? error.message : String(error),
});

/**
 * Loads the module and finds the export the pool asked for.
 *
 * @param message What the pool sent.
 * @returns Nothing once the task is ready, or the failure to report when the
 * module has no such export, or it is not callable.
 * @throws When the module itself cannot be loaded.
 */
const initialize = async (
	message: InitMessage,
): Promise<CodedFailure | null> => {
	const loaded: Record<string, unknown> = (await import(
		message.module
	)) as Record<string, unknown>;

	const found: unknown = loaded[message.export];

	if (typeof found !== 'function') {
		return { code: 'FULCRO3001', values: [message.module, message.export] };
	}

	task = found as (value: unknown) => unknown;

	return null;
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
		const failure: CodedFailure = { code: 'FULCRO3006', values: [] };

		reply({ kind: 'failed', id: message.id, ...failure });

		return;
	}

	try {
		reply({ kind: 'done', id: message.id, value: await task(message.value) });
	} catch (error) {
		reply({ kind: 'failed', id: message.id, ...describeForeign(error) });
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
			const failure: CodedFailure | null = await initialize(message);

			reply(
				failure === null ? { kind: 'ready' } : { kind: 'broken', ...failure },
			);
		} catch (error) {
			reply({ kind: 'broken', ...describeForeign(error) });
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
		throw createError('FULCRO3002');
	}

	reply = (message: unknown): void => {
		parentPort.postMessage(message);
	};

	parentPort.on('message', (message: Incoming) => {
		void receive(message);
	});
};

await listen();
