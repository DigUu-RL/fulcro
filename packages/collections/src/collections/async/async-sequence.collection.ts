import {
	AsyncAccumulator,
	AsyncAction,
	AsyncOptionalSelector,
	AsyncPredicate,
	AsyncResultSelector,
	AsyncSelector,
	ConcurrencyOptions,
	Constructor,
	Narrowed,
	Predicate,
	TerminalOptions,
	TypeNames,
	TypeTest,
	TypeToken,
} from '@/@types';
import { AsyncSequence } from '@/@types/collections/async';
import { Group } from '@/@types/collections/group';
import { Sequence } from '@/@types/collections/sequence';
import { createGroup } from '@/collections/factories';
// Imported through the barrel rather than the class file, because loading it is
// what registers the factories `createGroup` resolves through.
//
// This is the one edge from the asynchronous half to the synchronous one, and
// it is deliberate: `groupAdjacent` and `groupJoin` hand back the same `Group`
// and `Sequence` the synchronous operators do, since a run and a set of matches
// are both already in hand and nothing about them is waiting. The cost is that
// a bundle importing only `@fulcro/collections/async` now carries the
// synchronous sequence as well.
import { SequenceCollection } from '@/collections/sequence';
import { assertConcurrency, mapConcurrent } from '@/functions/concurrency';
import { TopWindow } from '@/functions/ranking';
import {
	describeExpected,
	describeType,
	resolveTypeTest,
} from '@/functions/types';

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

	/**
	 * Projects and filters in a single pass, keeping what the projection
	 * produced.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection returning a value, or nothing.
	 * @returns A deferred sequence with the values the projection produced.
	 */
	choose<R>(
		selector: AsyncOptionalSelector<T, R>,
	): AsyncSequence<NonNullable<R>> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<NonNullable<R>>({
			async *[Symbol.asyncIterator](): AsyncIterator<NonNullable<R>> {
				for await (const item of source) {
					const projected: R | null | undefined = await selector(item);

					// Only nullish results are dropped. `0`, `''` and `false` are
					// answers like any other.
					if (projected !== null && projected !== undefined) {
						yield projected as NonNullable<R>;
					}
				}
			},
		});
	}

	/**
	 * Projects and filters with several projections in flight at once.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection returning a value, or nothing.
	 * @param options How many to run at a time, and whether order is kept.
	 * @returns A deferred sequence with the values the projection produced.
	 */
	chooseAwait<R>(
		selector: AsyncOptionalSelector<T, R>,
		options: ConcurrencyOptions,
	): AsyncSequence<NonNullable<R>> {
		// Thrown here rather than on first iteration, so a bad limit fails where
		// it was written instead of somewhere down the chain.
		assertConcurrency('chooseAwait', options.concurrency);

		const projected: AsyncIterable<R | null | undefined> = mapConcurrent(
			this.source,
			selector,
			options,
		);

		return AsyncSequenceCollection.deferred<NonNullable<R>>({
			async *[Symbol.asyncIterator](): AsyncIterator<NonNullable<R>> {
				// Filtered after the concurrent stage rather than inside it: the
				// limit counts projections in flight, and dropping a result must
				// not change how many of those there are.
				for await (const result of projected) {
					if (result !== null && result !== undefined) {
						yield result as NonNullable<R>;
					}
				}
			},
		});
	}

	/**
	 * Keeps only the elements of a given runtime type.
	 *
	 * @template K Name of the primitive type.
	 * @param type Name of the type, a constructor, or a shape test.
	 * @returns A deferred sequence narrowed to that type.
	 */
	ofType<K extends keyof TypeNames>(
		type: K,
	): AsyncSequence<Narrowed<T, TypeNames[K]>>;

	/**
	 * Keeps only the elements built from a given class.
	 *
	 * @template R Type produced by the constructor.
	 * @param type Constructor the elements are tested against.
	 * @returns A deferred sequence narrowed to that type.
	 */
	ofType<R>(type: Constructor<R>): AsyncSequence<Narrowed<T, R>>;

	/**
	 * Keeps only the elements passing a test over their shape.
	 *
	 * @template R Type a passing value is taken to be.
	 * @param test Test over the shape of each element.
	 * @returns A deferred sequence narrowed to that type.
	 */
	ofType<R>(test: TypeTest<R>): AsyncSequence<Narrowed<T, R>>;

	/**
	 * Keeps only the elements of the given type, written as a type.
	 *
	 * @template R Type to keep.
	 * @returns A deferred sequence narrowed to that type.
	 */
	ofType<R>(): AsyncSequence<Narrowed<T, R>>;

	ofType(type?: TypeToken): AsyncSequence<unknown> {
		const source: AsyncIterable<T> = this.source;

		// Resolved now rather than on the first read: an unresolved type
		// argument is a build wired wrong, not data that is wrong.
		const matches: Predicate<unknown> = resolveTypeTest(type, 'ofType');

		return AsyncSequenceCollection.deferred<unknown>({
			async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
				for await (const item of source) {
					if (matches(item)) yield item;
				}
			},
		});
	}

	/**
	 * Re-types the sequence, refusing any element that disagrees.
	 *
	 * @template K Name of the primitive type.
	 * @param type Name of the type every element must have.
	 * @returns A deferred sequence typed as that type.
	 */
	cast<K extends keyof TypeNames>(type: K): AsyncSequence<TypeNames[K]>;

	/**
	 * Re-types the sequence to a class.
	 *
	 * @template R Type produced by the constructor.
	 * @param type Constructor every element must be an instance of.
	 * @returns A deferred sequence typed as that type.
	 */
	cast<R>(type: Constructor<R>): AsyncSequence<R>;

	/**
	 * Re-types the sequence, checking each element against a shape test.
	 *
	 * @template R Type every element must be.
	 * @param test Test over the shape of each element.
	 * @returns A deferred sequence typed as that type.
	 */
	cast<R>(test: TypeTest<R>): AsyncSequence<R>;

	/**
	 * Re-types the sequence to the given type, written as a type.
	 *
	 * @template R Type every element must be.
	 * @returns A deferred sequence typed as that type.
	 */
	cast<R>(): AsyncSequence<R>;

	cast(type?: TypeToken): AsyncSequence<unknown> {
		const source: AsyncIterable<T> = this.source;
		const matches: Predicate<unknown> = resolveTypeTest(type, 'cast');
		const expected: string = describeExpected(type as TypeToken);

		return AsyncSequenceCollection.deferred<unknown>({
			async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
				let index = 0;

				for await (const item of source) {
					if (!matches(item)) {
						// Thrown at the element that failed, so a bad page of a feed
						// is caught without the rest of it being read.
						throw new TypeError(
							`cast('${expected}') found a ${describeType(item)} at index ${index}.`,
						);
					}

					index++;
					yield item;
				}
			},
		});
	}

	/**
	 * Takes the elements with the largest keys, in descending order.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param count How many elements to keep.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	topBy<K>(keySelector: AsyncSelector<T, K>, count: number): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				if (count <= 0) return;

				const window = new TopWindow<T, K>(count);
				let arrival = 0;

				for await (const item of source) {
					window.offer(item, await keySelector(item), arrival++);
				}

				yield* window.drain();
			},
		});
	}

	/**
	 * The same, extracting several keys at once.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param count How many elements to keep.
	 * @param options How many keys to extract at a time.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	topByAwait<K>(
		keySelector: AsyncSelector<T, K>,
		count: number,
		options: ConcurrencyOptions,
	): AsyncSequence<T> {
		assertConcurrency('topByAwait', options.concurrency);

		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				if (count <= 0) return;

				// Numbered before the keys are extracted, not after. Concurrent
				// work finishes out of order, and ties break on arrival — so
				// recording the position later would let the order keys happened
				// to complete in decide which of two equal elements survives.
				let arrival = 0;

				const numbered: AsyncIterable<{
					readonly item: T;
					readonly arrival: number;
				}> = {
					async *[Symbol.asyncIterator]() {
						for await (const item of source) yield { item, arrival: arrival++ };
					},
				};

				const keyed = mapConcurrent(
					numbered,
					async (entry) => ({
						item: entry.item,
						arrival: entry.arrival,
						key: await keySelector(entry.item),
					}),
					options,
				);

				const window = new TopWindow<T, K>(count);

				for await (const entry of keyed) {
					window.offer(entry.item, entry.key, entry.arrival);
				}

				yield* window.drain();
			},
		});
	}

	/**
	 * Runs an action for every element as it passes, yielding it unchanged.
	 *
	 * @param action Action executed for each element.
	 * @returns A deferred sequence with the same elements.
	 */
	/**
	 * Sums the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The total, or `0` when nothing arrived.
	 */
	async sum(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		let total = 0;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			total += await AsyncSequenceCollection.valueOf(item, selector);
		}

		return total;
	}

	/**
	 * Averages the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The arithmetic mean.
	 * @throws {Error} When the sequence is empty.
	 */
	async average(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		let total = 0;
		let count = 0;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);
			total += await AsyncSequenceCollection.valueOf(item, selector);
			count++;
		}

		if (count === 0) throw new Error('average() needs at least one element.');

		return total / count;
	}

	/**
	 * Finds the smallest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The smallest value.
	 * @throws {Error} When the sequence is empty.
	 */
	async min(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		return AsyncSequenceCollection.extreme(
			this.source,
			selector,
			options,
			'min',
			(candidate, best) => candidate < best,
		);
	}

	/**
	 * Finds the largest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The largest value.
	 * @throws {Error} When the sequence is empty.
	 */
	async max(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		return AsyncSequenceCollection.extreme(
			this.source,
			selector,
			options,
			'max',
			(candidate, best) => candidate > best,
		);
	}

	/**
	 * Finds the element with the smallest key.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The element whose key is smallest.
	 * @throws {Error} When the sequence is empty.
	 */
	async minBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<T> {
		return AsyncSequenceCollection.extremeBy(
			this.source,
			keySelector,
			options,
			'minBy',
			(candidate, best) => candidate < best,
		);
	}

	/**
	 * Finds the element with the largest key.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The element whose key is largest.
	 * @throws {Error} When the sequence is empty.
	 */
	async maxBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<T> {
		return AsyncSequenceCollection.extremeBy(
			this.source,
			keySelector,
			options,
			'maxBy',
			(candidate, best) => candidate > best,
		);
	}

	/**
	 * Determines whether the sequence contains a value.
	 *
	 * @param value Value looked for.
	 * @param options Cancellation for this consumption.
	 * @returns `true` when it was found.
	 */
	async contains(value: T, options?: TerminalOptions): Promise<boolean> {
		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			// Stops here rather than draining what is left: the answer cannot
			// change, and the source may not end.
			if (item === value) return true;
		}

		return false;
	}

	/**
	 * Returns the only element of the sequence.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns The single element.
	 * @throws {Error} When the sequence is empty or holds more than one element.
	 */
	async single(options?: TerminalOptions): Promise<T> {
		const only: T | typeof NOT_FOUND = await AsyncSequenceCollection.only(
			this.source,
			options,
			'single',
		);

		if (only === NOT_FOUND) throw new Error('single() found no element.');

		return only as T;
	}

	/**
	 * Returns the only element of the sequence, or `null` when it is empty.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns The single element, or `null`.
	 * @throws {Error} When the sequence holds more than one element.
	 */
	async singleOrNull(options?: TerminalOptions): Promise<T | null> {
		const only: T | typeof NOT_FOUND = await AsyncSequenceCollection.only(
			this.source,
			options,
			'singleOrNull',
		);

		return only === NOT_FOUND ? null : (only as T);
	}

	/**
	 * Returns the element at a position.
	 *
	 * @param index Zero based position.
	 * @param options Cancellation for this consumption.
	 * @returns The element.
	 * @throws {Error} When the index is out of range.
	 */
	async elementAt(index: number, options?: TerminalOptions): Promise<T> {
		const found: T | null = await this.elementAtOrNull(index, options);

		if (found === null) {
			throw new Error(`elementAt(${index}) is out of range.`);
		}

		return found;
	}

	/**
	 * Determines whether two sequences hold the same elements in the same order.
	 *
	 * @param second Sequence compared with this one.
	 * @param options Cancellation for this consumption.
	 * @returns `true` when they match.
	 */
	async sequenceEqual(
		second: Iterable<T> | AsyncIterable<T>,
		options?: TerminalOptions,
	): Promise<boolean> {
		// Walked in step and stopped at the first difference, rather than reading
		// either side to the end to find out.
		const other = (
			Symbol.asyncIterator in Object(second)
				? (second as AsyncIterable<T>)[Symbol.asyncIterator]()
				: (second as Iterable<T>)[Symbol.iterator]()
		) as AsyncIterator<T> | Iterator<T>;

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			const next = await other.next();

			if (next.done === true || next.value !== item) return false;
		}

		return (await other.next()).done === true;
	}

	/**
	 * Counts how many elements share each key.
	 *
	 * @template K Type of the key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The counts per key.
	 */
	async countBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<Map<K, number>> {
		const counts = new Map<K, number>();

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			const key: K = await keySelector(item);

			counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		return counts;
	}

	/**
	 * Materializes the sequence into a map, one element per key.
	 *
	 * @template K Type of the key.
	 * @template R Type of the stored value.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection of the stored value.
	 * @param options Cancellation for this consumption.
	 * @returns The map.
	 * @throws {Error} When two elements share a key.
	 */
	async toMap<K, R = T>(
		keySelector: AsyncSelector<T, K>,
		elementSelector?: AsyncSelector<T, R>,
		options?: TerminalOptions,
	): Promise<Map<K, R>> {
		const mapped = new Map<K, R>();

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			const key: K = await keySelector(item);

			if (mapped.has(key)) {
				throw new Error(
					`toMap() found two elements with the key ${String(key)}.`,
				);
			}

			mapped.set(
				key,
				elementSelector === undefined
					? (item as unknown as R)
					: await elementSelector(item),
			);
		}

		return mapped;
	}

	/**
	 * Materializes the sequence into a map, grouping elements by key.
	 *
	 * @template K Type of the key.
	 * @template R Type of the stored value.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection of the stored value.
	 * @param options Cancellation for this consumption.
	 * @returns The map.
	 */
	async toLookup<K, R = T>(
		keySelector: AsyncSelector<T, K>,
		elementSelector?: AsyncSelector<T, R>,
		options?: TerminalOptions,
	): Promise<Map<K, R[]>> {
		const mapped = new Map<K, R[]>();

		for await (const item of this.source) {
			AsyncSequenceCollection.checkAborted(options);

			const key: K = await keySelector(item);

			const value: R =
				elementSelector === undefined
					? (item as unknown as R)
					: await elementSelector(item);

			const bucket: R[] | undefined = mapped.get(key);

			if (bucket === undefined) {
				mapped.set(key, [value]);
				continue;
			}

			bucket.push(value);
		}

		return mapped;
	}

	/**
	 * Measures how far the values spread around their mean, over the whole
	 * population.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The population standard deviation.
	 * @throws {Error} When the sequence is empty.
	 */
	async standardDeviation(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		const { count, squares } = await AsyncSequenceCollection.spread(
			this.source,
			selector,
			options,
		);

		if (count === 0) {
			throw new Error('standardDeviation() needs at least one element.');
		}

		return Math.sqrt(squares / count);
	}

	/**
	 * Measures how far the values spread around their mean, treating the
	 * sequence as a sample.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns The sample standard deviation.
	 * @throws {Error} When the sequence holds fewer than two elements.
	 */
	async sampleStandardDeviation(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number> {
		const { count, squares } = await AsyncSequenceCollection.spread(
			this.source,
			selector,
			options,
		);

		if (count < 2) {
			throw new Error(
				'sampleStandardDeviation() needs at least two elements: a sample of one says nothing about the spread it was drawn from.',
			);
		}

		return Math.sqrt(squares / (count - 1));
	}

	/**
	 * Reads the numeric value of an element.
	 *
	 * @template V Type of the element.
	 * @param item Element being read.
	 * @param selector Optional projection returning its value.
	 * @returns The value.
	 */
	private static async valueOf<V>(
		item: V,
		selector?: AsyncSelector<V, number>,
	): Promise<number> {
		return selector === undefined
			? (item as unknown as number)
			: await selector(item);
	}

	/**
	 * Finds the extreme numeric value of a source.
	 *
	 * @template V Type of the elements.
	 * @param source Source being read.
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @param operator Name of the calling operator, for the error.
	 * @param wins Whether a candidate beats the incumbent.
	 * @returns The extreme value.
	 * @throws {Error} When the source is empty.
	 */
	private static async extreme<V>(
		source: AsyncIterable<V>,
		selector: AsyncSelector<V, number> | undefined,
		options: TerminalOptions | undefined,
		operator: string,
		wins: (candidate: number, best: number) => boolean,
	): Promise<number> {
		let best: number | typeof NOT_FOUND = NOT_FOUND;

		for await (const item of source) {
			AsyncSequenceCollection.checkAborted(options);

			const value: number = await AsyncSequenceCollection.valueOf(
				item,
				selector,
			);

			if (best === NOT_FOUND || wins(value, best as number)) best = value;
		}

		if (best === NOT_FOUND) {
			throw new Error(`${operator}() needs at least one element.`);
		}

		return best as number;
	}

	/**
	 * Finds the element of a source whose key is extreme.
	 *
	 * A tie leaves the incumbent in place, so the first of several equal keys is
	 * the one returned — the same rule the synchronous operators keep.
	 *
	 * @template V Type of the elements.
	 * @template K Type of the compared key.
	 * @param source Source being read.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @param operator Name of the calling operator, for the error.
	 * @param wins Whether a candidate key beats the incumbent.
	 * @returns The element.
	 * @throws {Error} When the source is empty.
	 */
	private static async extremeBy<V, K>(
		source: AsyncIterable<V>,
		keySelector: AsyncSelector<V, K>,
		options: TerminalOptions | undefined,
		operator: string,
		wins: (candidate: K, best: K) => boolean,
	): Promise<V> {
		let best: V | typeof NOT_FOUND = NOT_FOUND;
		let bestKey: K | typeof NOT_FOUND = NOT_FOUND;

		for await (const item of source) {
			AsyncSequenceCollection.checkAborted(options);

			const key: K = await keySelector(item);

			if (bestKey === NOT_FOUND || wins(key, bestKey as K)) {
				best = item;
				bestKey = key;
			}
		}

		if (best === NOT_FOUND) {
			throw new Error(`${operator}() needs at least one element.`);
		}

		return best as V;
	}

	/**
	 * Reads at most two elements, which is all either `single` operator needs.
	 *
	 * @template V Type of the elements.
	 * @param source Source being read.
	 * @param options Cancellation for this consumption.
	 * @param operator Name of the calling operator, for the error.
	 * @returns The only element, or the sentinel when there was none.
	 * @throws {Error} When a second element arrives.
	 */
	private static async only<V>(
		source: AsyncIterable<V>,
		options: TerminalOptions | undefined,
		operator: string,
	): Promise<V | typeof NOT_FOUND> {
		let found: V | typeof NOT_FOUND = NOT_FOUND;

		for await (const item of source) {
			AsyncSequenceCollection.checkAborted(options);

			// Thrown at the second element rather than after counting them all:
			// the answer is settled, and the source may not end.
			if (found !== NOT_FOUND) {
				throw new Error(`${operator}() found more than one element.`);
			}

			found = item;
		}

		return found;
	}

	/**
	 * Accumulates the count and the squared deviations of a source.
	 *
	 * Uses Welford's method, which folds each value in as it arrives rather than
	 * collecting them to compute a mean and revisiting them — so a stream is
	 * measured without being held, and the arithmetic stays stable on values far
	 * from zero, where the textbook formula loses precision to cancellation.
	 *
	 * @template V Type of the elements.
	 * @param source Source being read.
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns How many values arrived and the sum of their squared deviations.
	 */
	private static async spread<V>(
		source: AsyncIterable<V>,
		selector: AsyncSelector<V, number> | undefined,
		options: TerminalOptions | undefined,
	): Promise<{ count: number; squares: number }> {
		let count = 0;
		let mean = 0;
		let squares = 0;

		for await (const item of source) {
			AsyncSequenceCollection.checkAborted(options);

			const value: number = await AsyncSequenceCollection.valueOf(
				item,
				selector,
			);

			count++;

			const delta: number = value - mean;

			mean += delta / count;
			squares += delta * (value - mean);
		}

		return { count, squares };
	}

	/**
	 * Reads a source of either kind into an array.
	 *
	 * Used by the operators whose second argument has to be in hand before the
	 * first element can be yielded. What it holds is bounded by that argument,
	 * never by the sequence it is called on.
	 *
	 * @template V Type of the elements.
	 * @param source Source being read.
	 * @returns Everything it produced.
	 */
	private static async collect<V>(
		source: Iterable<V> | AsyncIterable<V>,
	): Promise<V[]> {
		const collected: V[] = [];

		if (Symbol.asyncIterator in Object(source)) {
			for await (const item of source as AsyncIterable<V>) collected.push(item);

			return collected;
		}

		for (const item of source as Iterable<V>) collected.push(item);

		return collected;
	}

	/**
	 * Indexes a source by a key, for the join operators.
	 *
	 * @template I Type of the indexed elements.
	 * @template K Type of the key.
	 * @param source Source being indexed.
	 * @param keySelector Projection returning the key of each element.
	 * @returns The elements grouped by key.
	 */
	private static async index<I, K>(
		source: Iterable<I> | AsyncIterable<I>,
		keySelector: AsyncSelector<I, K>,
	): Promise<Map<K, I[]>> {
		const indexed = new Map<K, I[]>();

		for (const item of await AsyncSequenceCollection.collect(source)) {
			const key: K = await keySelector(item);
			const bucket: I[] | undefined = indexed.get(key);

			if (bucket === undefined) {
				indexed.set(key, [item]);
				continue;
			}

			bucket.push(item);
		}

		return indexed;
	}

	/**
	 * Appends values to the end of the sequence.
	 *
	 * @param values Values to yield after the source is exhausted.
	 * @returns A deferred sequence ending with them.
	 */
	append(...values: readonly T[]): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				yield* source;
				yield* values;
			},
		});
	}

	/**
	 * Puts values in front of the sequence.
	 *
	 * @param values Values to yield first.
	 * @returns A deferred sequence starting with them.
	 */
	prepend(...values: readonly T[]): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				// Before the source is touched at all, so a stream that has to be
				// opened is not opened to answer with something already known.
				yield* values;
				yield* source;
			},
		});
	}

	/**
	 * Yields a fallback when the sequence turns out to be empty.
	 *
	 * @param fallback Value yielded when nothing arrived.
	 * @returns A deferred sequence that is never empty.
	 */
	defaultIfEmpty(fallback: T): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				let seen = false;

				for await (const item of source) {
					seen = true;
					yield item;
				}

				if (!seen) yield fallback;
			},
		});
	}

	/**
	 * Pairs each element with the one before it.
	 *
	 * @returns A deferred sequence of consecutive pairs.
	 */
	pairwise(): AsyncSequence<[T, T]> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<[T, T]>({
			async *[Symbol.asyncIterator](): AsyncIterator<[T, T]> {
				// Held as a sentinel rather than as `undefined`, so an element that
				// is itself `undefined` still opens a pair.
				let previous: T | typeof NOT_FOUND = NOT_FOUND;

				for await (const item of source) {
					if (previous !== NOT_FOUND) yield [previous as T, item];

					previous = item;
				}
			},
		});
	}

	/**
	 * Yields overlapping runs of a fixed size.
	 *
	 * @param size Amount of elements per window.
	 * @returns A deferred sequence of windows.
	 * @throws {Error} When `size` is not a positive integer.
	 */
	windowed(size: number): AsyncSequence<T[]> {
		if (!Number.isInteger(size) || size <= 0) {
			throw new Error('windowed() takes a positive integer size.');
		}

		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T[]>({
			async *[Symbol.asyncIterator](): AsyncIterator<T[]> {
				const window: T[] = [];

				for await (const item of source) {
					window.push(item);

					if (window.length > size) window.shift();
					// Copied on the way out: the window keeps moving, and a consumer
					// holding what it was handed must not watch it change.
					if (window.length === size) yield [...window];
				}
			},
		});
	}

	/**
	 * Takes the trailing elements of the sequence.
	 *
	 * @param count Amount of trailing elements to take.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	takeLast(count: number): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				if (count <= 0) return;

				const window: T[] = [];

				for await (const item of source) {
					window.push(item);

					if (window.length > count) window.shift();
				}

				yield* window;
			},
		});
	}

	/**
	 * Drops the trailing elements of the sequence.
	 *
	 * @param count Amount of trailing elements to drop.
	 * @returns A deferred sequence without them.
	 */
	skipLast(count: number): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				if (count <= 0) {
					yield* source;
					return;
				}

				// An element is released once `count` more have arrived behind it,
				// which is what lets this stream where `takeLast` cannot.
				const held: T[] = [];

				for await (const item of source) {
					held.push(item);

					if (held.length > count) yield held.shift() as T;
				}
			},
		});
	}

	/**
	 * Groups consecutive elements sharing a key.
	 *
	 * @template K Type of the grouping key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence of groups.
	 */
	groupAdjacent<K>(
		keySelector: AsyncSelector<T, K>,
	): AsyncSequence<Group<K, T>> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<Group<K, T>>({
			async *[Symbol.asyncIterator](): AsyncIterator<Group<K, T>> {
				let currentKey: K | typeof NOT_FOUND = NOT_FOUND;
				let run: T[] = [];

				for await (const item of source) {
					const key: K = await keySelector(item);

					if (currentKey === NOT_FOUND) {
						currentKey = key;
						run = [item];
						continue;
					}

					if (key === currentKey) {
						run.push(item);
						continue;
					}

					yield createGroup(currentKey as K, run);

					currentKey = key;
					run = [item];
				}

				if (currentKey !== NOT_FOUND) yield createGroup(currentKey as K, run);
			},
		});
	}

	/**
	 * Merges this sequence with another, pairwise.
	 *
	 * @template S Type of the elements of the second sequence.
	 * @template R Type of the merged result.
	 * @param second Sequence paired with this one.
	 * @param resultSelector Merges each pair.
	 * @returns A deferred sequence of merged results.
	 */
	zip<S, R>(
		second: Iterable<S> | AsyncIterable<S>,
		resultSelector: AsyncResultSelector<T, S, R>,
	): AsyncSequence<R> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<R>({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				// Pulled in step rather than one side being read first, which is what
				// lets an endless source be zipped with a finite one.
				const other = (
					Symbol.asyncIterator in Object(second)
						? (second as AsyncIterable<S>)[Symbol.asyncIterator]()
						: (second as Iterable<S>)[Symbol.iterator]()
				) as AsyncIterator<S> | Iterator<S>;

				for await (const item of source) {
					const next = await other.next();

					if (next.done === true) return;

					yield await resultSelector(item, next.value);
				}
			},
		});
	}

	/**
	 * Keeps the elements that are not in another sequence.
	 *
	 * @param second Sequence whose elements are excluded.
	 * @returns A deferred sequence with the distinct remaining elements.
	 */
	except(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const excluded = new Set(await AsyncSequenceCollection.collect(second));
				const seen = new Set<T>();

				for await (const item of source) {
					if (excluded.has(item) || seen.has(item)) continue;

					seen.add(item);
					yield item;
				}
			},
		});
	}

	/**
	 * Keeps the elements whose key is not in another sequence.
	 *
	 * @template K Type of the compared key.
	 * @param second Keys to exclude.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with the remaining elements.
	 */
	exceptBy<K>(
		second: Iterable<K> | AsyncIterable<K>,
		keySelector: AsyncSelector<T, K>,
	): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const excluded = new Set(await AsyncSequenceCollection.collect(second));
				const seen = new Set<K>();

				for await (const item of source) {
					const key: K = await keySelector(item);

					if (excluded.has(key) || seen.has(key)) continue;

					seen.add(key);
					yield item;
				}
			},
		});
	}

	/**
	 * Keeps only the elements present in both sequences.
	 *
	 * @param second Sequence intersected with this one.
	 * @returns A deferred sequence with the distinct common elements.
	 */
	intersect(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const wanted = new Set(await AsyncSequenceCollection.collect(second));
				const seen = new Set<T>();

				for await (const item of source) {
					if (!wanted.has(item) || seen.has(item)) continue;

					seen.add(item);
					yield item;
				}
			},
		});
	}

	/**
	 * Keeps only the elements whose key is present in both.
	 *
	 * @template K Type of the compared key.
	 * @param second Keys to keep.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with the matching elements.
	 */
	intersectBy<K>(
		second: Iterable<K> | AsyncIterable<K>,
		keySelector: AsyncSelector<T, K>,
	): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const wanted = new Set(await AsyncSequenceCollection.collect(second));
				const seen = new Set<K>();

				for await (const item of source) {
					const key: K = await keySelector(item);

					if (!wanted.has(key) || seen.has(key)) continue;

					seen.add(key);
					yield item;
				}
			},
		});
	}

	/**
	 * Concatenates with another sequence, discarding duplicates.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the distinct elements of both.
	 */
	union(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const seen = new Set<T>();

				for await (const item of source) {
					if (seen.has(item)) continue;

					seen.add(item);
					yield item;
				}

				// Read only once this sequence is exhausted, so the second side is
				// never held while the first is still arriving.
				for (const item of await AsyncSequenceCollection.collect(second)) {
					if (seen.has(item)) continue;

					seen.add(item);
					yield item;
				}
			},
		});
	}

	/**
	 * Concatenates with another sequence, discarding duplicate keys.
	 *
	 * @template K Type of the compared key.
	 * @param second Sequence appended to this one.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per distinct key.
	 */
	unionBy<K>(
		second: Iterable<T> | AsyncIterable<T>,
		keySelector: AsyncSelector<T, K>,
	): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				const seen = new Set<K>();

				for await (const item of source) {
					const key: K = await keySelector(item);

					if (seen.has(key)) continue;

					seen.add(key);
					yield item;
				}

				for (const item of await AsyncSequenceCollection.collect(second)) {
					const key: K = await keySelector(item);

					if (seen.has(key)) continue;

					seen.add(key);
					yield item;
				}
			},
		});
	}

	/**
	 * Correlates this sequence with another by a key.
	 *
	 * @template I Type of the inner elements.
	 * @template K Type of the correlated key.
	 * @template R Type of the merged result.
	 * @param innerCollection Sequence joined to this one.
	 * @param outerKeySelector Key of each element of this sequence.
	 * @param innerKeySelector Key of each inner element.
	 * @param resultSelector Merges a matching pair.
	 * @returns A deferred sequence of merged results.
	 */
	join<I, K, R>(
		innerCollection: Iterable<I> | AsyncIterable<I>,
		outerKeySelector: AsyncSelector<T, K>,
		innerKeySelector: AsyncSelector<I, K>,
		resultSelector: AsyncResultSelector<T, I, R>,
	): AsyncSequence<R> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<R>({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				// Indexed once rather than scanned per outer element, which is the
				// difference between one pass over the inner side and one per
				// element of a stream that may never end.
				const indexed = await AsyncSequenceCollection.index(
					innerCollection,
					innerKeySelector,
				);

				for await (const outer of source) {
					const matches: I[] | undefined = indexed.get(
						await outerKeySelector(outer),
					);

					if (matches === undefined) continue;

					for (const inner of matches) yield await resultSelector(outer, inner);
				}
			},
		});
	}

	/**
	 * Correlates this sequence with another, grouping the matches.
	 *
	 * @template I Type of the inner elements.
	 * @template K Type of the correlated key.
	 * @template R Type of the merged result.
	 * @param innerCollection Sequence joined to this one.
	 * @param outerKeySelector Key of each element of this sequence.
	 * @param innerKeySelector Key of each inner element.
	 * @param resultSelector Merges an element with its matches.
	 * @returns A deferred sequence of merged results.
	 */
	groupJoin<I, K, R>(
		innerCollection: Iterable<I> | AsyncIterable<I>,
		outerKeySelector: AsyncSelector<T, K>,
		innerKeySelector: AsyncSelector<I, K>,
		resultSelector: (outer: T, inner: Sequence<I>) => R | PromiseLike<R>,
	): AsyncSequence<R> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<R>({
			async *[Symbol.asyncIterator](): AsyncIterator<R> {
				const indexed = await AsyncSequenceCollection.index(
					innerCollection,
					innerKeySelector,
				);

				for await (const outer of source) {
					const matches: I[] = indexed.get(await outerKeySelector(outer)) ?? [];

					// An ordinary synchronous sequence: the matches are already in
					// hand, so nothing about them is waiting on anything.
					yield await resultSelector(outer, SequenceCollection.from(matches));
				}
			},
		});
	}

	tap(action: AsyncAction<T>): AsyncSequence<T> {
		const source: AsyncIterable<T> = this.source;

		return AsyncSequenceCollection.deferred<T>({
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				let index = 0;

				for await (const item of source) {
					// Awaited before the element is handed on, so an action that
					// waits holds the stream where it is rather than letting it run
					// ahead of the observation.
					await action(item, index++);
					yield item;
				}
			},
		});
	}
}
