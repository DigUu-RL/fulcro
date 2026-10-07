import { type CancellationToken, type TaskWork } from '@/@types/index.js';

/**
 * Work the test finishes by hand.
 *
 * The task scope suites are about *when* things happen — which task is
 * running while another fails, what is still waiting when a cancellation
 * arrives — and a timer answers that by chance. Here every piece of work stays
 * pending until the test settles it, and records what the scope did with it.
 */

/** One piece of controlled work, and what has happened to it. */
export interface ControlledWork<T> {
	/** The work to hand to `spawn`. */
	readonly work: TaskWork<T>;

	/** Whether the scope has started the work. */
	readonly started: () => boolean;

	/** The token the work was handed, once it has started. */
	readonly token: () => CancellationToken | undefined;

	/**
	 * Settles the work with a value.
	 *
	 * @param value What the work produces.
	 */
	readonly succeed: (value: T) => void;

	/**
	 * Settles the work with a failure.
	 *
	 * @param error What the work throws.
	 */
	readonly fail: (error: unknown) => void;
}

/**
 * Creates work that stays pending until the test settles it.
 *
 * Work that has not started yet settles as soon as it starts, so a test can
 * decide the outcome before the scope gets round to the work.
 *
 * @template T Type the work produces.
 * @param options What to do when the token is cancelled while the work runs:
 * reject with the reason, as `fetch` does, unless told to ignore it.
 * @returns The work and its controls.
 */
export const controlledWork = <T>(
	options: { readonly honoursCancellation?: boolean } = {},
): ControlledWork<T> => {
	let handedToken: CancellationToken | undefined;
	let outcome: { readonly value: T } | { readonly error: unknown } | undefined;
	let settle: (() => void) | undefined;

	const work: TaskWork<T> = (token) => {
		handedToken = token;

		return new Promise<T>((resolve, reject) => {
			settle = (): void => {
				if (outcome === undefined) return;
				if ('value' in outcome) resolve(outcome.value);
				if ('error' in outcome) reject(outcome.error);
			};

			if (options.honoursCancellation !== false) {
				token.onCancelled((reason) => {
					outcome ??= { error: reason };
					settle?.();
				});
			}

			settle();
		});
	};

	return {
		work,
		started: () => handedToken !== undefined,
		token: () => handedToken,
		succeed: (value) => {
			outcome ??= { value };
			settle?.();
		},
		fail: (error) => {
			outcome ??= { error };
			settle?.();
		},
	};
};

/**
 * Lets every pending microtask and promise reaction run.
 *
 * A macrotask boundary rather than a fixed number of `await`s, so the count of
 * hops inside the scope is not something the suites depend on.
 *
 * @returns A promise settling on the next turn of the event loop.
 */
export const flush = (): Promise<void> =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
