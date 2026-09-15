/**
 * Tests an element against a condition.
 *
 * @template T Type of the evaluated element.
 * @param value Element being evaluated.
 * @returns `true` when the element satisfies the condition, otherwise `false`.
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Projects an element into another shape.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value.
 */
export type Selector<T, R> = (value: T) => R;

/**
 * Compares two elements in order to sort them.
 *
 * @template T Type of the compared elements.
 * @param left Element placed on the left side of the comparison.
 * @param right Element placed on the right side of the comparison.
 * @returns A negative number when `left` comes first, a positive number when
 * `right` comes first, and `0` when both elements are equivalent.
 */
export type Comparer<T> = (left: T, right: T) => number;

/**
 * Consumes an element together with its positional index.
 *
 * @template T Type of the consumed element.
 * @param value Element being consumed.
 * @param index Zero based position of the element in the sequence.
 */
export type Action<T> = (value: T, index: number) => void;

/**
 * Merges a pair of correlated elements into a single result.
 *
 * @template O Type of the outer element.
 * @template I Type of the inner element.
 * @template R Type of the produced result.
 * @param outer Element coming from the outer sequence.
 * @param inner Element coming from the inner sequence.
 * @returns The merged result.
 */
export type ResultSelector<O, I, R> = (outer: O, inner: I) => R;

/**
 * Accumulates a sequence into a single value.
 *
 * @template A Type of the accumulated value.
 * @template T Type of the aggregated elements.
 * @param accumulator Value accumulated so far.
 * @param item Element being aggregated.
 * @returns The new accumulated value.
 */
export type Accumulator<A, T> = (accumulator: A, item: T) => A;

/**
 * Tests an element against a condition that may need to wait.
 *
 * Every asynchronous operator takes this form rather than the synchronous one,
 * so a plain predicate works unchanged and an awaited one needs no separate
 * operator to call it from.
 *
 * @template T Type of the evaluated element.
 * @param value Element being evaluated.
 * @returns `true` when the element satisfies the condition, or a promise of it.
 */
export type AsyncPredicate<T> = (value: T) => boolean | PromiseLike<boolean>;

/**
 * Projects an element into another shape, possibly after waiting.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value, or a promise of it.
 */
export type AsyncSelector<T, R> = (value: T) => R | PromiseLike<R>;

/**
 * Consumes an element together with its positional index, possibly after
 * waiting.
 *
 * @template T Type of the consumed element.
 * @param value Element being consumed.
 * @param index Zero based position of the element in the sequence.
 * @returns Nothing, or a promise that settles when the element is dealt with.
 */
export type AsyncAction<T> = (
	value: T,
	index: number,
) => void | PromiseLike<void>;

/**
 * Accumulates a sequence into a single value, possibly waiting on each step.
 *
 * @template A Type of the accumulated value.
 * @template T Type of the aggregated elements.
 * @param accumulator Value accumulated so far.
 * @param item Element being aggregated.
 * @returns The new accumulated value, or a promise of it.
 */
export type AsyncAccumulator<A, T> = (
	accumulator: A,
	item: T,
) => A | PromiseLike<A>;

/**
 * What a terminal operator of an asynchronous sequence accepts beyond its own
 * arguments.
 *
 * Cancellation lives here rather than on the deferred operators or on the
 * factory, because it is a property of *consuming* a sequence rather than of
 * describing one: the terminal is where the waiting happens and where the
 * promise that rejects lives, so the same sequence can be consumed twice under
 * different signals.
 */
export interface TerminalOptions {
	/**
	 * Signal calling the consumption off.
	 *
	 * Aborting does two things and cannot do a third. No further element is
	 * pulled, and the returned promise rejects with the reason the signal
	 * carries. Work already in flight keeps running to completion — a promise
	 * has no cancel, and nothing here can invent one — and its result is
	 * discarded. A selector that takes a signal of its own is handed this one,
	 * and that work does stop.
	 */
	readonly signal?: AbortSignal;
}
