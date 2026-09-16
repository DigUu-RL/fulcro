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
	TerminalOptions,
	TypeNames,
	TypeTest,
} from '@/@types';
import { Group } from '@/@types/collections/group';
import { Sequence } from '@/@types/collections/sequence';

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
	 * Projects every element into a new shape, several at a time.
	 *
	 * The concurrent form of {@link AsyncSequence.select}. Where that one awaits
	 * an element before pulling the next, this keeps up to `concurrency` of them
	 * in flight — which for work that spends its time waiting is the difference
	 * between the sum of the waits and the longest of them.
	 *
	 * ```ts
	 * const users = await ids.selectAwait(loadUser, { concurrency: 8 }).toArray();
	 * ```
	 *
	 * It deliberately gives up the back pressure the rest of the type keeps: up
	 * to `concurrency` elements are pulled before any result is handed back.
	 *
	 * Results come back in input order by default. A rejection stops the
	 * sequence: no further work is started, whatever is already running is
	 * awaited so nothing is left unobserved, and the rejection then surfaces.
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
	): AsyncSequence<R>;

	/**
	 * Filters the sequence, evaluating several conditions at a time.
	 *
	 * For a predicate that has to ask something — a permission check, a lookup —
	 * rather than one that can answer from the element alone.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @param options How many at a time, and in what order.
	 * @returns A deferred sequence with the matching elements.
	 * @throws {Error} When `concurrency` is not a positive integer.
	 */
	whereAwait(
		predicate: AsyncPredicate<T>,
		options: ConcurrencyOptions,
	): AsyncSequence<T>;

	/**
	 * Runs an action for every element, several at a time.
	 *
	 * The terminal counterpart of {@link AsyncSequence.selectAwait}, for work
	 * done for its effects — writing rows, sending requests — where no result is
	 * collected.
	 *
	 * The index handed to the action is the position of the element in the
	 * source, not the order in which the actions happened to run.
	 *
	 * @param action Action invoked with each element and its index.
	 * @param options How many at a time, in what order, and cancellation.
	 * @returns A promise settling when every element has been dealt with.
	 * @throws {Error} When `concurrency` is not a positive integer.
	 */
	forEachAwait(
		action: AsyncAction<T>,
		options: ConcurrencyOptions & TerminalOptions,
	): Promise<void>;

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

	/**
	 * Projects and filters in a single pass, keeping what the projection
	 * produced.
	 *
	 * The projection is awaited for one element at a time, which is what keeps
	 * the back pressure of the source intact. Use
	 * {@link AsyncSequence.chooseAwait} to run several at once.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection returning a value, or nothing.
	 * @returns A deferred sequence with the values the projection produced.
	 */
	choose<R>(
		selector: AsyncOptionalSelector<T, R>,
	): AsyncSequence<NonNullable<R>>;

	/**
	 * Projects and filters with several projections in flight at once.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection returning a value, or nothing.
	 * @param options How many to run at a time, and whether order is kept.
	 * @returns A deferred sequence with the values the projection produced.
	 * @throws {Error} When the concurrency is not a positive integer.
	 */
	chooseAwait<R>(
		selector: AsyncOptionalSelector<T, R>,
		options: ConcurrencyOptions,
	): AsyncSequence<NonNullable<R>>;

	/**
	 * Keeps only the elements of a given runtime type, narrowing the sequence.
	 *
	 * There is no `Await` counterpart, and there is nothing missing: deciding a
	 * type is work the runtime does on the spot, with nothing to wait for, so
	 * concurrency would add machinery around no waiting at all.
	 *
	 * @template K Name of the primitive type.
	 * @param type Name of the type to keep.
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
	 * Needs the transformer of this package, which resolves the type argument
	 * into a runtime test — writing an interface out as the checks its
	 * properties imply.
	 *
	 * @template R Type to keep.
	 * @returns A deferred sequence narrowed to that type.
	 * @throws {Error} When the call was not resolved at compile time.
	 */
	ofType<R>(): AsyncSequence<Narrowed<T, R>>;

	/**
	 * Re-types the sequence, refusing any element that disagrees.
	 *
	 * The operator this exists for: a stream of records from somewhere that
	 * cannot be trusted, checked against a type as it arrives rather than after
	 * being collected. It refuses at the element that failed, so a bad page is
	 * caught without the whole feed being read first.
	 *
	 * @template K Name of the primitive type.
	 * @param type Name of the type every element must have.
	 * @returns A deferred sequence typed as that type.
	 * @throws {TypeError} When an element is not of that type, as it is read.
	 */
	cast<K extends keyof TypeNames>(type: K): AsyncSequence<TypeNames[K]>;

	/**
	 * Re-types the sequence to a class.
	 *
	 * @template R Type produced by the constructor.
	 * @param type Constructor every element must be an instance of.
	 * @returns A deferred sequence typed as that type.
	 * @throws {TypeError} When an element is not an instance, as it is read.
	 */
	cast<R>(type: Constructor<R>): AsyncSequence<R>;

	/**
	 * Re-types the sequence, checking each element against a shape test.
	 *
	 * @template R Type every element must be.
	 * @param test Test over the shape of each element.
	 * @returns A deferred sequence typed as that type.
	 * @throws {TypeError} When an element fails the test, as it is read.
	 */
	cast<R>(test: TypeTest<R>): AsyncSequence<R>;

	/**
	 * Re-types the sequence to the given type, written as a type.
	 *
	 * @template R Type every element must be.
	 * @returns A deferred sequence typed as that type.
	 * @throws {Error} When the call was not resolved at compile time.
	 * @throws {TypeError} When an element fails the check, as it is read.
	 */
	cast<R>(): AsyncSequence<R>;

	/**
	 * Takes the elements with the largest keys, in descending order.
	 *
	 * Keeps a window of the best `count` seen so far rather than collecting the
	 * source and sorting it, so the memory it holds is bounded by `count` and
	 * not by the length of the stream.
	 *
	 * It does have to reach the end before it can answer — nothing can know the
	 * top ten of a stream that has not finished — so it never completes over an
	 * endless source. Put a `take` in front of one.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param count How many elements to keep.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	topBy<K>(keySelector: AsyncSelector<T, K>, count: number): AsyncSequence<T>;

	/**
	 * The same, extracting several keys at once.
	 *
	 * For a key that has to be fetched or computed rather than read. The window
	 * stays bounded and ties still break on arrival order, which is recorded
	 * before the keys are extracted rather than after — otherwise finishing out
	 * of order would quietly change the answer.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param count How many elements to keep.
	 * @param options How many keys to extract at a time.
	 * @returns A deferred sequence with at most `count` elements.
	 * @throws {Error} When the concurrency is not a positive integer.
	 */
	topByAwait<K>(
		keySelector: AsyncSelector<T, K>,
		count: number,
		options: ConcurrencyOptions,
	): AsyncSequence<T>;

	/**
	 * Runs an action for every element as it passes, yielding it unchanged.
	 *
	 * Awaited one element at a time, so an action that waits holds the stream
	 * where it is instead of racing ahead of it — which is usually the point of
	 * looking inside an asynchronous chain.
	 *
	 * @param action Action executed for each element.
	 * @returns A deferred sequence with the same elements.
	 */
	tap(action: AsyncAction<T>): AsyncSequence<T>;

	/**
	 * Appends values to the end of the sequence.
	 *
	 * @param values Values to yield after the source is exhausted.
	 * @returns A deferred sequence ending with them.
	 */
	append(...values: readonly T[]): AsyncSequence<T>;

	/**
	 * Puts values in front of the sequence.
	 *
	 * They are yielded before the source is pulled at all, which on a stream
	 * that has to be opened is the difference between a header arriving now and
	 * arriving after a round trip.
	 *
	 * @param values Values to yield first.
	 * @returns A deferred sequence starting with them.
	 */
	prepend(...values: readonly T[]): AsyncSequence<T>;

	/**
	 * Yields a fallback when the sequence turns out to be empty.
	 *
	 * @param fallback Value yielded when nothing arrived.
	 * @returns A deferred sequence that is never empty.
	 */
	defaultIfEmpty(fallback: T): AsyncSequence<T>;

	/**
	 * Pairs each element with the one before it.
	 *
	 * Holds one element, whatever the length of the stream — the natural way to
	 * turn arriving readings into differences between them.
	 *
	 * @returns A deferred sequence of consecutive pairs, one shorter than the
	 * source.
	 */
	pairwise(): AsyncSequence<[T, T]>;

	/**
	 * Yields overlapping runs of a fixed size.
	 *
	 * Holds `size` elements, not the stream.
	 *
	 * @param size Amount of elements per window.
	 * @returns A deferred sequence of windows.
	 * @throws {Error} When `size` is not a positive integer.
	 */
	windowed(size: number): AsyncSequence<T[]>;

	/**
	 * Takes the trailing elements of the sequence.
	 *
	 * Holds `count` elements rather than the stream, but it cannot yield any of
	 * them before the source ends — nothing can know the last ten of something
	 * still arriving. It therefore never completes over an endless source.
	 *
	 * @param count Amount of trailing elements to take.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	takeLast(count: number): AsyncSequence<T>;

	/**
	 * Drops the trailing elements of the sequence.
	 *
	 * Unlike {@link AsyncSequence.takeLast} this one streams: it yields an
	 * element as soon as `count` more have arrived behind it, so it holds a
	 * window rather than waiting for the end.
	 *
	 * @param count Amount of trailing elements to drop.
	 * @returns A deferred sequence without them.
	 */
	skipLast(count: number): AsyncSequence<T>;

	/**
	 * Groups consecutive elements sharing a key.
	 *
	 * The grouping operator that belongs on a stream. A new group opens whenever
	 * the key changes, so the same key can open several — and only the run in
	 * hand is held, which is what `groupBy` cannot do and why `groupBy` is not
	 * offered here.
	 *
	 * @template K Type of the grouping key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence of groups, in the order the runs arrived.
	 */
	groupAdjacent<K>(
		keySelector: AsyncSelector<T, K>,
	): AsyncSequence<Group<K, T>>;

	/**
	 * Merges this sequence with another, pairwise.
	 *
	 * Both sides are pulled in step and it stops at the shorter, so an endless
	 * source zipped with a finite one finishes.
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
	): AsyncSequence<R>;

	/**
	 * Keeps the elements that are not in another sequence.
	 *
	 * The other sequence is read into a set before anything is yielded, so what
	 * is held is bounded by **it** rather than by the stream. That is the same
	 * bargain the synchronous operator makes, and it is why passing a stream as
	 * the argument is a bad idea while being one yourself is fine.
	 *
	 * @param second Sequence whose elements are excluded.
	 * @returns A deferred sequence with the distinct remaining elements.
	 */
	except(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T>;

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
	): AsyncSequence<T>;

	/**
	 * Keeps only the elements present in both sequences.
	 *
	 * @param second Sequence intersected with this one.
	 * @returns A deferred sequence with the distinct common elements.
	 */
	intersect(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T>;

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
	): AsyncSequence<T>;

	/**
	 * Concatenates with another sequence, discarding duplicates.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the distinct elements of both.
	 */
	union(second: Iterable<T> | AsyncIterable<T>): AsyncSequence<T>;

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
	): AsyncSequence<T>;

	/**
	 * Correlates this sequence with another by a key, one result per matching
	 * pair.
	 *
	 * The inner side is indexed before anything is yielded — once, not once per
	 * outer element — so what is held is bounded by the inner sequence while the
	 * outer one streams past it. Which side to pass matters: the stream belongs
	 * on the outside.
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
	): AsyncSequence<R>;

	/**
	 * Correlates this sequence with another, one result per outer element with
	 * its matches grouped — a left join.
	 *
	 * @template I Type of the inner elements.
	 * @template K Type of the correlated key.
	 * @template R Type of the merged result.
	 * @param innerCollection Sequence joined to this one.
	 * @param outerKeySelector Key of each element of this sequence.
	 * @param innerKeySelector Key of each inner element.
	 * @param resultSelector Merges an element with its matches, which arrive as
	 * an ordinary synchronous sequence since they are already in hand.
	 * @returns A deferred sequence of merged results.
	 */
	groupJoin<I, K, R>(
		innerCollection: Iterable<I> | AsyncIterable<I>,
		outerKeySelector: AsyncSelector<T, K>,
		innerKeySelector: AsyncSelector<I, K>,
		resultSelector: (outer: T, inner: Sequence<I>) => R | PromiseLike<R>,
	): AsyncSequence<R>;

	/**
	 * Sums the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the total, or `0` when nothing arrived.
	 */
	sum(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;

	/**
	 * Averages the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the arithmetic mean.
	 * @throws {Error} When the sequence is empty.
	 */
	average(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;

	/**
	 * Finds the smallest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the smallest value.
	 * @throws {Error} When the sequence is empty.
	 */
	min(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;

	/**
	 * Finds the largest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the largest value.
	 * @throws {Error} When the sequence is empty.
	 */
	max(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;

	/**
	 * Finds the element with the smallest key.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the element whose key is smallest.
	 * @throws {Error} When the sequence is empty.
	 */
	minBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<T>;

	/**
	 * Finds the element with the largest key.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the element whose key is largest.
	 * @throws {Error} When the sequence is empty.
	 */
	maxBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<T>;

	/**
	 * Determines whether the sequence contains a value.
	 *
	 * Stops at the first match, so it does not read a stream it has already
	 * answered from.
	 *
	 * @param value Value looked for.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether it was found.
	 */
	contains(value: T, options?: TerminalOptions): Promise<boolean>;

	/**
	 * Returns the only element of the sequence.
	 *
	 * Stops at the second element, since by then the answer is settled.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the single element.
	 * @throws {Error} When the sequence is empty or holds more than one element.
	 */
	single(options?: TerminalOptions): Promise<T>;

	/**
	 * Returns the only element of the sequence, or `null` when it is empty.
	 *
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the single element, or `null`.
	 * @throws {Error} When the sequence holds more than one element.
	 */
	singleOrNull(options?: TerminalOptions): Promise<T | null>;

	/**
	 * Returns the element at a position.
	 *
	 * @param index Zero based position.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the element.
	 * @throws {Error} When the index is out of range.
	 */
	elementAt(index: number, options?: TerminalOptions): Promise<T>;

	/**
	 * Determines whether two sequences hold the same elements in the same order.
	 *
	 * Both are pulled in step and it stops at the first difference, rather than
	 * reading either to the end to find out.
	 *
	 * @param second Sequence compared with this one.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of whether they match.
	 */
	sequenceEqual(
		second: Iterable<T> | AsyncIterable<T>,
		options?: TerminalOptions,
	): Promise<boolean>;

	/**
	 * Counts how many elements share each key.
	 *
	 * What it holds is bounded by the amount of **distinct keys**, not by the
	 * stream — which is what makes counting a category over an endless feed
	 * reasonable and counting an identifier not.
	 *
	 * @template K Type of the key.
	 * @param keySelector Projection returning the key of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the counts per key.
	 */
	countBy<K>(
		keySelector: AsyncSelector<T, K>,
		options?: TerminalOptions,
	): Promise<Map<K, number>>;

	/**
	 * Materializes the sequence into a map, one element per key.
	 *
	 * @template K Type of the key.
	 * @template R Type of the stored value. Defaults to `T`.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection of the stored value. Pass
	 * `undefined` to reach `options` without one.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the map.
	 * @throws {Error} When two elements share a key.
	 */
	toMap<K, R = T>(
		keySelector: AsyncSelector<T, K>,
		elementSelector?: AsyncSelector<T, R>,
		options?: TerminalOptions,
	): Promise<Map<K, R>>;

	/**
	 * Materializes the sequence into a map, grouping elements by key.
	 *
	 * @template K Type of the key.
	 * @template R Type of the stored value. Defaults to `T`.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection of the stored value. Pass
	 * `undefined` to reach `options` without one.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the map.
	 */
	toLookup<K, R = T>(
		keySelector: AsyncSelector<T, K>,
		elementSelector?: AsyncSelector<T, R>,
		options?: TerminalOptions,
	): Promise<Map<K, R[]>>;

	/**
	 * Measures how far the values spread around their mean, treating the
	 * sequence as the whole population.
	 *
	 * Accumulated in a single pass rather than by collecting the values and
	 * revisiting them, so a stream is measured without being held.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the population standard deviation.
	 * @throws {Error} When the sequence is empty.
	 */
	standardDeviation(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;

	/**
	 * Measures how far the values spread around their mean, treating the
	 * sequence as a sample of a larger population.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @param options Cancellation for this consumption.
	 * @returns A promise of the sample standard deviation.
	 * @throws {Error} When the sequence holds fewer than two elements.
	 */
	sampleStandardDeviation(
		selector?: AsyncSelector<T, number>,
		options?: TerminalOptions,
	): Promise<number>;
}
