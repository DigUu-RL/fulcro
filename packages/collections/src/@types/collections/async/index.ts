import {
	AsyncAccumulator,
	AsyncAction,
	AsyncPredicate,
	AsyncSelector,
	TerminalOptions,
} from '@/@types';

/**
 * A lazily evaluated sequence whose elements are not all available yet.
 *
 * The counterpart of {@link Sequence}, built on `AsyncIterable<T>` rather than
 * `Iterable<T>` — a page of an API, a line of a file being streamed, a row
 * arriving from a cursor. It is consumed with `for await...of`, or through any
 * of the terminal operators below.
 *
 * One rule covers the whole surface, and it is worth learning once instead of
 * per operator: **every deferred operator keeps the name it has on the
 * synchronous sequence and returns another `AsyncSequence`; every terminal
 * keeps its name and returns a `Promise` of what it returned there.** There is
 * no `toArrayAsync`. The type already says it.
 *
 * Every projection, predicate and action accepts a synchronous function as
 * readily as one returning a promise, so nothing has to be wrapped to be used
 * here.
 *
 * Elements are pulled one at a time, and each is processed before the next is
 * asked for. That is what keeps a sequence over a large file from buffering the
 * file — and it is deliberately given up by the concurrent operators, which say
 * so in their own documentation.
 *
 * @template T Type of the elements contained in the sequence.
 */
export interface AsyncSequence<T> extends AsyncIterable<T> {
	/**
	 * Filters the sequence keeping only the elements matching a condition.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @returns A deferred sequence with the matching elements.
	 */
	where(predicate: AsyncPredicate<T>): AsyncSequence<T>;

	/**
	 * Projects every element into a new shape.
	 *
	 * Awaits one element before pulling the next. Use `selectAwait` to overlap
	 * the waiting across several.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element.
	 * @returns A deferred sequence with the projected elements.
	 */
	select<R>(selector: AsyncSelector<T, R>): AsyncSequence<R>;

	/**
	 * Projects every element into a sequence and flattens the results.
	 *
	 * @template R Type of the elements produced by the projection.
	 * @param selector Projection returning an iterable, or an asynchronous one,
	 * for each element.
	 * @returns A deferred sequence with all the inner elements concatenated.
	 */
	selectMany<R>(
		selector: AsyncSelector<T, Iterable<R> | AsyncIterable<R>>,
	): AsyncSequence<R>;

	/**
	 * Takes the leading elements of the sequence.
	 *
	 * Stops pulling once it has what it needs, which on an endless source is
	 * the difference between finishing and not.
	 *
	 * @param count Maximum amount of elements to take.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	take(count: number): AsyncSequence<T>;

	/**
	 * Bypasses the leading elements of the sequence.
	 *
	 * @param count Amount of elements to bypass.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skip(count: number): AsyncSequence<T>;

	/**
	 * Takes the leading elements while a condition holds.
	 *
	 * @param predicate Condition the leading elements satisfy.
	 * @returns A deferred sequence with the leading matching elements.
	 */
	takeWhile(predicate: AsyncPredicate<T>): AsyncSequence<T>;

	/**
	 * Bypasses the leading elements while a condition holds.
	 *
	 * @param predicate Condition the bypassed leading elements satisfy.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skipWhile(predicate: AsyncPredicate<T>): AsyncSequence<T>;

	/**
	 * Removes the duplicated elements of the sequence.
	 *
	 * @returns A deferred sequence without duplicates.
	 */
	distinct(): AsyncSequence<T>;

	/**
	 * Removes the duplicated elements, comparing by a key.
	 *
	 * @template K Type of the key elements are compared by.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per distinct key.
	 */
	distinctBy<K>(keySelector: AsyncSelector<T, K>): AsyncSequence<T>;

	/**
	 * Appends another sequence to this one.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the elements of both, in order.
	 */
	concat(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T>;

	/**
	 * Splits the sequence into arrays of a fixed size.
	 *
	 * The natural way to batch an arriving stream — a thousand rows into pages
	 * of a hundred, written one page at a time.
	 *
	 * @param size Amount of elements per chunk.
	 * @returns A deferred sequence of arrays.
	 * @throws {Error} When `size` is not a positive integer.
	 */
	chunk(size: number): AsyncSequence<T[]>;

	/**
	 * Accumulates the sequence, yielding every intermediate value.
	 *
	 * @template A Type of the accumulated value. Defaults to `T`.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @returns A deferred sequence of the accumulated values.
	 */
	scan<A = T>(seed: A, callback: AsyncAccumulator<A, T>): AsyncSequence<A>;

	/**
	 * Materializes the sequence into an array.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of an array holding every element.
	 */
	toArray(options?: TerminalOptions): Promise<T[]>;

	/**
	 * Materializes the sequence into a set, discarding duplicates.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of a set holding the distinct elements.
	 */
	toSet(options?: TerminalOptions): Promise<Set<T>>;

	/**
	 * Counts the elements of the sequence.
	 *
	 * Unlike its synchronous counterpart this always traverses: an
	 * `AsyncIterable` declares no length for anything to read ahead of time.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the amount of elements.
	 */
	count(options?: TerminalOptions): Promise<number>;

	/**
	 * Determines whether the sequence contains any element.
	 *
	 * Stops at the first one, so an endless source still answers.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether the sequence holds anything.
	 */
	any(options?: TerminalOptions): Promise<boolean>;

	/**
	 * Determines whether every element satisfies a condition.
	 *
	 * @param predicate Condition every element must satisfy.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether no element failed.
	 */
	all(
		predicate: AsyncPredicate<T>,
		options?: TerminalOptions,
	): Promise<boolean>;

	/**
	 * Returns the first element of the sequence.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the first element.
	 * @throws {Error} When the sequence is empty.
	 */
	first(options?: TerminalOptions): Promise<T>;

	/**
	 * Returns the first element of the sequence, or `null` when there is none.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the first element, or of `null`.
	 */
	firstOrNull(options?: TerminalOptions): Promise<T | null>;

	/**
	 * Returns the last element of the sequence.
	 *
	 * Traverses to the end, since nothing else can establish which element was
	 * last.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the last element.
	 * @throws {Error} When the sequence is empty.
	 */
	last(options?: TerminalOptions): Promise<T>;

	/**
	 * Returns the last element of the sequence, or `null` when there is none.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the last element, or of `null`.
	 */
	lastOrNull(options?: TerminalOptions): Promise<T | null>;

	/**
	 * Reads the element at a position.
	 *
	 * The only way to read positionally: an asynchronous sequence has no
	 * `sequence[5]`, because the value is not there to hand back.
	 *
	 * @param index Zero based position of the element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the element, or of `null` when out of range.
	 */
	elementAtOrNull(index: number, options?: TerminalOptions): Promise<T | null>;

	/**
	 * Runs an action for every element of the sequence.
	 *
	 * Awaits each action before pulling the next element. Use `forEachAwait` to
	 * overlap them.
	 *
	 * @param action Action invoked with each element and its index.
	 * @param options Cancellation for this consumption.
	 * @returns A promise settling when every element has been dealt with.
	 */
	forEach(action: AsyncAction<T>, options?: TerminalOptions): Promise<void>;

	/**
	 * Reduces the sequence into a single value.
	 *
	 * @template A Type of the accumulated value. Defaults to `T`.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the final accumulated value.
	 */
	aggregate<A = T>(
		seed: A,
		callback: AsyncAccumulator<A, T>,
		options?: TerminalOptions,
	): Promise<A>;
}
