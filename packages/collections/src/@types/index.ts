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
