import {
	AsyncAccumulator,
	AsyncAction,
	AsyncPredicate,
	AsyncSelector,
	ConcurrencyOptions,
	TerminalOptions,
} from '@/@types';
import { AsyncSequence } from '@/@types/collections/async';
import { assertConcurrency, mapConcurrent } from '@/functions/concurrency';

/**
 * Marks the absence of an element, so that one which is itself `null` or
 * `undefined` is never mistaken for a missing one.
 */
const NOT_FOUND = Symbol('not-found');

/**
 * Base implementation of {@link AsyncSequence}.
 *
 * Every deferred operator describes a traversal and consumes nothing until the
 * result is iterated, exactly as the synchronous sequence does. The difference
 * is where the waiting goes: operators pull one element, settle whatever the
 * caller's function returned, and only then ask for the next — which is what
 * keeps a sequence over a large source from reading ahead of its consumer.
 *
 * No `Proxy` wraps these instances. The synchronous sequence uses one for
 * positional access, and there is nothing an asynchronous one could hand back
 * from a property read that would mean the same thing.
 *
 * @template T Type of the elements contained in the sequence.
 */
export class AsyncSequenceCollection<T> implements AsyncSequence<T> {
	/** Underlying source traversed by the sequence. */
	private readonly source: AsyncIterable<T>;

	/**
	 * Initializes the sequence.
	 *
	 * Kept private on purpose: sequences are created through
	 * {@link AsyncSequenceCollection.from} and
	 * {@link AsyncSequenceCollection.empty}, which normalise whatever source
	 * they are given into a single shape.
	 *
	 * @param source Underlying source traversed by the sequence.
	 */
	private constructor(source: AsyncIterable<T>) {
		this.source = source;
	}

	/**
	 * Traverses the underlying source.
	 *
	 * @returns An iterator over the elements of the sequence.
	 */
	[Symbol.asyncIterator](): AsyncIterator<T> {
		return this.source[Symbol.asyncIterator]();
	}

	/**
	 * Normalises anything iterable into an asynchronous iterable.
	 *
	 * A synchronous source is adapted rather than drained, so an infinite
	 * generator stays usable, and its elements are awaited on the way through —
	 * which is what makes an array of promises work as a source.
	 *
	 * @template T Type of the elements contained in the source.
	 * @param source Source of any of the accepted shapes.
	 * @returns The source as an asynchronous iterable.
	 */
	private static normalize<T>(
		source:
			| AsyncIterable<T>
			| Iterable<T>
			| Iterable<PromiseLike<T>>
			| Iterable<T | PromiseLike<T>>,
	): AsyncIterable<T> {
		if (Symbol.asyncIterator in Object(source)) {
			return source as AsyncIterable<T>;
		}

		const synchronous = source as Iterable<T | PromiseLike<T>>;

		return {
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				for (const item of synchronous) yield await item;
			},
		};
	}

	/**
	 * Creates a sequence over a source that produces over time.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Asynchronous iterable wrapped by the sequence.
	 * @returns The created sequence.
	 */
	static from<T>(source: AsyncIterable<T>): AsyncSequence<T>;

	/**
	 * Creates a sequence over a synchronous source, so that it can be used
	 * where an asynchronous one is wanted.
	 *
	 * Elements that are promises are awaited on the way through, which covers
	 * the common `ids.map(load)` shape.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Iterable wrapped by the sequence.
	 * @returns The created sequence.
	 */
	static from<T>(source: Iterable<T | PromiseLike<T>>): AsyncSequence<T>;

	static from<T>(
		source: AsyncIterable<T> | Iterable<T | PromiseLike<T>>,
	): AsyncSequence<T> {
		return new AsyncSequenceCollection<T>(
			AsyncSequenceCollection.normalize<T>(source),
		);
	}

	/**
	 * Creates an empty sequence.
	 *
	 * @template T Type of the elements the sequence would contain.
	 * @returns An empty sequence.
	 */
	static empty<T>(): AsyncSequence<T> {
		return AsyncSequenceCollection.from<T>([]);
	}

	/**
	 * Creates the deferred sequence returned by the query operators.
	 *
	 * @template R Type of the elements contained in the sequence.
	 * @param source Traversal described by the operator.
	 * @returns The deferred sequence.
	 */
	private static deferred<R>(source: AsyncIterable<R>): AsyncSequence<R> {
		return new AsyncSequenceCollection<R>(source);
	}

	/**
	 * Throws when a consumption has been called off.
	 *
	 * Checked before each element is pulled rather than only at the start, so
	 * aborting a long traversal takes effect within one element rather than at
	 * the end.
	 *
	 * @param options Options the terminal was called with.
	 * @throws {Error} The reason the signal carries, when it is aborted.
	 */
	private static checkAborted(options?: TerminalOptions): void {
		options?.signal?.throwIfAborted();
	}

	/**
	 * Filters the sequence keeping only the elements matching a condition.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @returns A deferred sequence with the matching elements.
	 */
	where(predicate: AsyncPredicate<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				for await (const item of source) if (await predicate(item)) yield item;
			},
		});
	}

	/**
	 * Projects every element into a new shape.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element.
	 * @returns A deferred sequence with the projected elements.
	 */
	select<R>(selector: AsyncSelector<T, R>): AsyncSequence<R> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<R>({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				for await (const item of source) yield await selector(item);
			},
		});
	}

	/**
	 * Projects every element into a sequence and flattens the results.
	 *
	 * @template R Type of the elements produced by the projection.
	 * @param selector Projection returning an iterable for each element.
	 * @returns A deferred sequence with all the inner elements concatenated.
	 */
	selectMany<R>(
		selector: AsyncSelector<T, Iterable<R> | AsyncIterable<R>>,
	): AsyncSequence<R> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<R>({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				for await (const item of source) {
					const inner: Iterable<R> | AsyncIterable<R> = await selector(item);

					// `for await` accepts both shapes, so an inner sequence may be
					// synchronous or not without the caller saying which.
					for await (const nested of inner as AsyncIterable<R>) yield nested;
				}
			},
		});
	}

	/**
	 * Takes the leading elements of the sequence.
	 *
	 * @param count Maximum amount of elements to take.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	take(count: number): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				if (count <= 0) return;

				let taken = 0;

				for await (const item of source) {
					yield item;

					// Returning here closes the source iterator, which is what
					// stops an endless producer rather than leaving it running.
					if (++taken >= count) return;
				}
			},
		});
	}

	/**
	 * Bypasses the leading elements of the sequence.
	 *
	 * @param count Amount of elements to bypass.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skip(count: number): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				let skipped = 0;

				for await (const item of source) {
					if (skipped < count) {
						skipped++;
						continue;
					}

					yield item;
				}
			},
		});
	}

	/**
	 * Takes the leading elements while a condition holds.
	 *
	 * @param predicate Condition the leading elements satisfy.
	 * @returns A deferred sequence with the leading matching elements.
	 */
	takeWhile(predicate: AsyncPredicate<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				for await (const item of source) {
					if (!(await predicate(item))) return;

					yield item;
				}
			},
		});
	}

	/**
	 * Bypasses the leading elements while a condition holds.
	 *
	 * @param predicate Condition the bypassed leading elements satisfy.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skipWhile(predicate: AsyncPredicate<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				let skipping = true;

				for await (const item of source) {
					if (skipping && (await predicate(item))) continue;

					skipping = false;
					yield item;
				}
			},
		});
	}

	/**
	 * Removes the duplicated elements of the sequence.
	 *
	 * @returns A deferred sequence without duplicates.
	 */
	distinct(): AsyncSequence<T> {
		return this.distinctBy((item) => item);
	}

	/**
	 * Removes the duplicated elements, comparing by a key.
	 *
	 * @template K Type of the key elements are compared by.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per distinct key.
	 */
	distinctBy<K>(keySelector: AsyncSelector<T, K>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const seen = new Set<K>();

				for await (const item of source) {
					const key: K = await keySelector(item);

					if (seen.has(key)) continue;

					seen.add(key);
					yield item;
				}
			},
		});
	}

	/**
	 * Appends another sequence to this one.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the elements of both, in order.
	 */
	concat(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				yield* source;

				for await (const item of second as AsyncIterable<T>) yield item;
			},
		});
	}

	/**
	 * Splits the sequence into arrays of a fixed size.
	 *
	 * @param size Amount of elements per chunk.
	 * @returns A deferred sequence of arrays.
	 * @throws {Error} When `size` is not a positive integer.
	 */
	chunk(size: number): AsyncSequence<T[]> {
		if (!Number.isInteger(size) || size < 1) {
			throw new Error(
				`chunk(${size}) needs a positive integer: a chunk of no elements would never end the sequence.`,
			);
		}

		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T[]>({
			async *[Symbol.asyncIterator](): AsyncIterator<T[]> {
				let current: T[] = [];

				for await (const item of source) {
					current.push(item);

					if (current.length === size) {
						yield current;
						current = [];
					}
				}

				if (current.length > 0) yield current;
			},
		});
	}

	/**
	 * Accumulates the sequence, yielding every intermediate value.
	 *
	 * @template A Type of the accumulated value.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @returns A deferred sequence of the accumulated values.
	 */
	scan<A = T>(seed: A, callback: AsyncAccumulator<A, T>): AsyncSequence<A> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<A>({
			async *[Symbol.asyncIterator](): AsyncIterator<A> {
				let accumulator: A = seed;

				for await (const item of source) {
					accumulator = await callback(accumulator, item);
					yield accumulator;
				}
			},
		});
	}

	/**
	 * Projects every element into a new shape, several at a time.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element.
	 * @param options How many at a time, and in what order.
	 * @returns A deferred sequence with the projected elements.
	 * @throws {Error} When `concurrency` is not a positive integer.
	 */
	selectAwait<R>(
		selector: AsyncSelector<T, R>,
		options: ConcurrencyOptions,
	): AsyncSequence<R> {
		// Thrown here rather than on first iteration, so a bad limit fails where
		// it was written instead of somewhere down the chain.
		assertConcurrency('selectAwait', options.concurrency);

		return AsyncSequenceCollection.deferred<R>(
			mapConcurrent(this.source, selector, options),
		);
	}

	/**
	 * Filters the sequence, evaluating several conditions at a time.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @param options How many at a time, and in what order.
	 * @returns A deferred sequence with the matching elements.
	 * @throws {Error} When `concurrency` is not a positive integer.
	 */
	whereAwait(
		predicate: AsyncPredicate<T>,
		options: ConcurrencyOptions,
	): AsyncSequence<T> {
		assertConcurrency('whereAwait', options.concurrency);

		// The element is carried alongside its verdict rather than looked up
		// again, so an unordered run still knows which one it was judging.
		const judged: AsyncIterable<{ item: T; keep: boolean }> = mapConcurrent(
			this.source,
			async (item: T) => ({ item, keep: await predicate(item) }),
			options,
		);

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				for await (const { item, keep } of judged) if (keep) yield item;
			},
		});
	}

	/**
	 * Runs an action for every element, several at a time.
	 *
	 * @param action Action invoked with each element and its index.
	 * @param options How many at a time, in what order, and cancellation.
	 * @returns A promise settling when every element has been dealt with.
	 * @throws {Error} When `concurrency` is not a positive integer.
	 */
	async forEachAwait(
		action: AsyncAction<T>,
		options: ConcurrencyOptions & TerminalOptions,
	): Promise<void> {
		assertConcurrency('forEachAwait', options.concurrency);

		let index = 0;

		// The index is taken as the element is pulled, so it reports the
		// position in the source rather than the order the actions finished in.
		const running: AsyncIterable<void> = mapConcurrent(
			this.source,
			async (item: T) => {
				await action(item, index++);
			},
			options,
		);

		for await (const _ of running) {
			AsyncSequenceCollection.checkAborted(options);
		}
	}

	/**
	 * Materializes the sequence into an array.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of an array holding every element.
	 */
	async toArray(options?: TerminalOptions): Promise<T[]> {
		const collected: T[] = [];

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			collected.push(item);
		}

		return collected;
	}

	/**
	 * Materializes the sequence into a set, discarding duplicates.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of a set holding the distinct elements.
	 */
	async toSet(options?: TerminalOptions): Promise<Set<T>> {
		return new Set<T>(await this.toArray(options));
	}

	/**
	 * Counts the elements of the sequence.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the amount of elements.
	 */
	async count(options?: TerminalOptions): Promise<number> {
		let counted = 0;

		for await (const _ of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			counted++;
		}

		return counted;
	}

	/**
	 * Determines whether the sequence contains any element.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether the sequence holds anything.
	 */
	async any(options?: TerminalOptions): Promise<boolean> {
		for await (const _ of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			// The first element settles it, and returning closes the source.
			return true;
		}

		return false;
	}

	/**
	 * Determines whether every element satisfies a condition.
	 *
	 * @param predicate Condition every element must satisfy.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether no element failed.
	 */
	async all(
		predicate: AsyncPredicate<T>,
		options?: TerminalOptions,
	): Promise<boolean> {
		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			if (!(await predicate(item))) return false;
		}

		return true;
	}

	/**
	 * Returns the first element of the sequence.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the first element.
	 * @throws {Error} When the sequence is empty.
	 */
	async first(options?: TerminalOptions): Promise<T> {
		const found: T | null = await this.firstOrNull(options);

		if (found === null) {
			throw new Error('first() was called on an empty sequence.');
		}

		return found;
	}

	/**
	 * Returns the first element of the sequence, or `null` when there is none.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the first element, or of `null`.
	 */
	async firstOrNull(options?: TerminalOptions): Promise<T | null> {
		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			return item;
		}

		return null;
	}

	/**
	 * Returns the last element of the sequence.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the last element.
	 * @throws {Error} When the sequence is empty.
	 */
	async last(options?: TerminalOptions): Promise<T> {
		const found: T | typeof NOT_FOUND = await this.resolveLast(options);

		if (found === NOT_FOUND) {
			throw new Error('last() was called on an empty sequence.');
		}

		return found;
	}

	/**
	 * Returns the last element of the sequence, or `null` when there is none.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the last element, or of `null`.
	 */
	async lastOrNull(options?: TerminalOptions): Promise<T | null> {
		const found: T | typeof NOT_FOUND = await this.resolveLast(options);

		return found === NOT_FOUND ? null : found;
	}

	/**
	 * Traverses to the end, keeping whatever came last.
	 *
	 * Uses a sentinel rather than `null` so that a sequence whose last element
	 * is itself `null` is not reported as empty.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns The last element, or the sentinel when there was none.
	 */
	private async resolveLast(
		options?: TerminalOptions,
	): Promise<T | typeof NOT_FOUND> {
		let found: T | typeof NOT_FOUND = NOT_FOUND;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			found = item;
		}

		return found;
	}

	/**
	 * Reads the element at a position.
	 *
	 * @param index Zero based position of the element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the element, or of `null` when out of range.
	 */
	async elementAtOrNull(
		index: number,
		options?: TerminalOptions,
	): Promise<T | null> {
		if (!Number.isInteger(index) || index < 0) return null;

		let position = 0;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			if (position === index) return item;

			position++;
		}

		return null;
	}

	/**
	 * Runs an action for every element of the sequence.
	 *
	 * @param action Action invoked with each element and its index.
	 * @param options Cancellation for this consumption.
	 * @returns A promise settling when every element has been dealt with.
	 */
	async forEach(
		action: AsyncAction<T>,
		options?: TerminalOptions,
	): Promise<void> {
		let index = 0;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			await action(item, index++);
		}
	}

	/**
	 * Reduces the sequence into a single value.
	 *
	 * @template A Type of the accumulated value.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the final accumulated value.
	 */
	async aggregate<A = T>(
		seed: A,
		callback: AsyncAccumulator<A, T>,
		options?: TerminalOptions,
	): Promise<A> {
		let accumulator: A = seed;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			accumulator = await callback(accumulator, item);
		}

		return accumulator;
	}
}
