import { CancellationSource, CancellationToken } from '@/@types/index.js';

/** What a registration returns when there is nothing left to remove. */
const NOTHING_TO_RELEASE: Disposable = Object.freeze({
	[Symbol.dispose]: (): void => {},
});

/**
 * Cancellations of children waiting their turn, while a cancellation is
 * already reaching its descendants; `null` when none is.
 *
 * A child is cancelled from inside its parent's abort listener, so a chain of
 * sources cancelled one inside the next takes a stack frame per generation —
 * and at about two thousand generations the stack overflows inside a listener,
 * which the platform reports as an uncaught exception while every generation
 * below stays live. Queued here instead, the outermost cancellation runs them
 * one after another at a constant depth, before it returns.
 */
let propagating: (() => void)[] | null = null;

/**
 * Runs a child's cancellation now, or after the one in progress.
 *
 * @param step The child's cancellation.
 */
const propagate = (step: () => void): void => {
	if (propagating !== null) {
		propagating.push(step);

		return;
	}

	const queue: (() => void)[] = [step];

	propagating = queue;

	try {
		for (let index = 0; index < queue.length; index++) queue[index]();
	} finally {
		propagating = null;
	}
};

/**
 * Calls a handler registered after the cancellation, reporting what it throws
 * as an abort listener's throw is reported.
 *
 * A handler registered in time runs as a listener, where a throw never reaches
 * the code that called `cancel`. A late one would otherwise throw into the code
 * that registered it, so one handler would fail two ways depending on when it
 * was registered. Rethrown from a microtask, it reaches the same place a
 * listener's does: an uncaught exception on Node, `reportError` in a browser.
 *
 * @param handler The handler.
 * @param reason The reason the work was called off.
 */
const callLate = (
	handler: (reason: unknown) => void,
	reason: unknown,
): void => {
	try {
		handler(reason);
	} catch (error) {
		queueMicrotask(() => {
			throw error;
		});
	}
};

/**
 * Creates a cancellation, optionally following a parent one.
 *
 * ```ts
 * const source = createCancellationSource();
 *
 * const loading = load(url, source.token);
 *
 * cancelButton.onclick = () => source.cancel();
 * ```
 *
 * Built on the platform's `AbortController`, so `source.token.signal` is an
 * ordinary `AbortSignal`: what the token says and what the signal says can
 * never disagree, because they are the same state read two ways.
 *
 * A handler registered with `onCancelled` that throws is reported the way the
 * platform reports a throwing abort listener — on Node, as an uncaught
 * exception — whether it was registered before the cancellation or after it.
 *
 * @param parent A cancellation to follow. When it is called off, so is this
 * one, with its reason; when it already has been, this one starts cancelled.
 * However deep a chain of sources, the cancellation reaches every one of them
 * before `cancel` returns.
 * @returns The source. Dispose it to stop following `parent`.
 */
export const createCancellationSource = (
	parent?: CancellationToken,
): CancellationSource => {
	const controller = new AbortController();
	const signal: AbortSignal = controller.signal;

	// `abort(undefined)` is what makes the platform supply its `AbortError`,
	// so a call without a reason and a call with an explicit `undefined` agree.
	const cancel = (reason?: unknown): void => {
		controller.abort(reason);
	};

	const onCancelled = (handler: (reason: unknown) => void): Disposable => {
		if (signal.aborted) {
			callLate(handler, signal.reason);

			return NOTHING_TO_RELEASE;
		}

		const listener = (): void => {
			handler(signal.reason);
		};

		signal.addEventListener('abort', listener, { once: true });

		return Object.freeze({
			[Symbol.dispose]: (): void => {
				signal.removeEventListener('abort', listener);
			},
		});
	};

	const token: CancellationToken = Object.freeze({
		get isCancelled(): boolean {
			return signal.aborted;
		},
		get reason(): unknown {
			return signal.reason;
		},
		signal,
		throwIfCancelled: (): void => {
			signal.throwIfAborted();
		},
		onCancelled,
	});

	const following: Disposable =
		parent === undefined
			? NOTHING_TO_RELEASE
			: parent.onCancelled((reason) => {
					propagate(() => {
						cancel(reason);
					});
				});

	return Object.freeze({
		token,
		cancel,
		[Symbol.dispose]: (): void => {
			following[Symbol.dispose]();
		},
	});
};
