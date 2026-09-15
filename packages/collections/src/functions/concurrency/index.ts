import { AsyncSelector, ConcurrencyOptions } from '@/@types';

/**
 * The bounded concurrency every `Await` operator is built on.
 *
 * One traversal, at most `concurrency` selectors running at a time, and two
 * orderings to hand the results back in. Everything else — `selectAwait`,
 * `whereAwait`, `forEachAwait` — is this function with a different projection
 * in front of it, so the limit, the failure handling and the cleanup are
 * written once.
 */

/**
 * Checks that a concurrency limit is one an operator can honour.
 *
 * Rejected loudly at the call rather than clamped quietly: a limit of `0` would
 * mean an operator that never starts anything, and a fractional one has no
 * meaning at all.
 *
 * @param operation Name of the calling operator, for the error message.
 * @param concurrency Limit the caller asked for.
 * @throws {Error} When the limit is not a positive integer.
 */
export const assertConcurrency = (
	operation: string,
	concurrency: number,
): void => {
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new Error(
			`${operation}() needs a positive integer concurrency, and was given ${concurrency}.`,
		);
	}
};

/**
 * Runs a projection over a sequence, several elements at a time.
 *
 * Completion order is recorded as each piece of work finishes rather than read
 * off a race when the consumer next looks. The difference matters: by the time
 * a consumer comes back for the next result, several may have settled, and a
 * race among already-settled promises resolves in the order they were created —
 * which is input order wearing completion order's clothes.
 *
 * @template T Type of the elements of the source.
 * @template R Type produced by the projection.
 * @param source Sequence being traversed.
 * @param selector Projection applied to each element.
 * @param options Limit and ordering.
 * @returns An asynchronous iterable of the results.
 */
export const mapConcurrent = <T, R>(
	source: AsyncIterable<T>,
	selector: AsyncSelector<T, R>,
	options: ConcurrencyOptions,
): AsyncIterable<R> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<R> {
		const { concurrency } = options;
		const ordered: boolean = options.ordered ?? true;

		const iterator: AsyncIterator<T> = source[Symbol.asyncIterator]();

		/** Results that have arrived, keyed by the position they came from. */
		const arrived = new Map<number, R>();

		/** Positions in the order their work actually finished. */
		const finished: number[] = [];

		/** Work still running, so it can be settled before giving up. */
		const running = new Set<Promise<void>>();

		/** The first failure, kept so the traversal can end on it. */
		let failure: { readonly error: unknown } | null = null;

		/**
		 * Reads the failure back through a call.
		 *
		 * Control flow analysis does not follow assignments made inside the
		 * closures below, so reading `failure` directly narrows it to `null` and
		 * the branch that handles it becomes unreachable in the compiler's eyes.
		 * A call returns the declared type instead.
		 *
		 * @returns The first failure, or `null` while there has been none.
		 */
		const failed = (): { readonly error: unknown } | null => failure;

		/** Resolver of the promise the loop parks on between completions. */
		let wake: (() => void) | null = null;

		let started = 0;
		let delivered = 0;
		let exhausted = false;

		/** Releases the loop, if it is waiting. */
		const notify = (): void => {
			const waiting: (() => void) | null = wake;

			wake = null;
			waiting?.();
		};

		/**
		 * Begins the work for one element.
		 *
		 * @param item Element being worked on.
		 * @param position Position the element held in the source.
		 */
		const start = (item: T, position: number): void => {
			const task: Promise<void> = (async (): Promise<void> => {
				try {
					const value: R = await selector(item);

					arrived.set(position, value);
					finished.push(position);
				} catch (error) {
					failure ??= { error };
				}

				notify();
			})();

			running.add(task);
			void task.then(() => {
				running.delete(task);
			});
		};

		/**
		 * Starts work until the limit is reached or the source runs out.
		 *
		 * Elements are pulled one at a time — a source cannot be read ahead of
		 * itself — while the work started on them overlaps, which is the point.
		 */
		const fill = async (): Promise<void> => {
			while (!exhausted && failed() === null && running.size < concurrency) {
				const next: IteratorResult<T> = await iterator.next();

				if (next.done === true) {
					exhausted = true;
					return;
				}

				start(next.value, started++);
			}
		};

		/**
		 * Settles everything still running and discards the outcomes.
		 *
		 * Reached on a rejection and on a consumer that stopped asking. Without
		 * it those promises would be left unobserved, and a later rejection
		 * among them would surface as an unhandled one from work nobody was
		 * waiting on any more.
		 */
		const drain = async (): Promise<void> => {
			await Promise.allSettled([...running]);
			running.clear();
		};

		/**
		 * The position ready to be handed over, if there is one.
		 *
		 * @returns The position, or `null` while nothing is deliverable.
		 */
		const deliverable = (): number | null => {
			if (ordered) return arrived.has(delivered) ? delivered : null;

			return finished.shift() ?? null;
		};

		try {
			await fill();

			for (;;) {
				const broken = failed();

				if (broken !== null) {
					await drain();
					throw broken.error;
				}

				const position: number | null = deliverable();

				if (position !== null) {
					const value: R = arrived.get(position) as R;

					arrived.delete(position);
					delivered++;

					yield value;

					await fill();
					continue;
				}

				// Nothing to hand over, and nothing left that could produce any.
				if (exhausted && running.size === 0) return;

				// Parked until a completion calls `notify`. Nothing can settle
				// between the check above and here, because neither awaits.
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
		} finally {
			await drain();
			await iterator.return?.();
		}
	},
});
