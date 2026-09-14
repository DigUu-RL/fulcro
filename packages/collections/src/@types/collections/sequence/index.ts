import {
	Accumulator,
	Action,
	Predicate,
	ResultSelector,
	Selector,
} from '@/@types';
import { Group } from '@/@types/collections/group';
import { OrderedSequence } from '@/@types/collections/ordered';

/**
 * A lazily evaluated sequence of elements exposing the query operators.
 *
 * Every operator that returns another {@link Sequence} is deferred: the
 * source is only traversed when the resulting sequence is iterated (for
 * instance through {@link Sequence.toArray} or a `for...of` loop). Operators
 * returning a scalar, an array or a map are executed immediately.
 *
 * @template T Type of the elements contained in the sequence.
 */
export interface Sequence<T> extends Iterable<T> {
	/**
	 * Reads the element stored at the given position.
	 *
	 * Random access is provided by a `Proxy`, therefore sequences backed by a
	 * non indexable source are traversed until the position is reached.
	 *
	 * @param index Zero based position of the element.
	 * @returns The element at `index`, or `undefined` when out of range.
	 */
	[index: number]: T;

	/**
	 * Filters the sequence keeping only the elements matching a condition.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @returns A deferred sequence with the matching elements.
	 */
	where(predicate: Predicate<T>): Sequence<T>;

	/**
	 * Projects every element into a new shape.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element.
	 * @returns A deferred sequence with the projected elements.
	 */
	select<R>(selector: Selector<T, R>): Sequence<R>;

	/**
	 * Projects every element into an iterable and flattens the results into a
	 * single sequence.
	 *
	 * @template R Type of the elements produced by the projection.
	 * @param selector Projection returning an iterable for each element.
	 * @returns A deferred sequence with all the inner elements concatenated.
	 */
	selectMany<R>(selector: Selector<T, Iterable<R>>): Sequence<R>;

	/**
	 * Returns the first element of the sequence, optionally the first one
	 * matching a condition.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The first matching element.
	 * @throws {Error} When no element matches.
	 */
	first(predicate?: Predicate<T>): T;

	/**
	 * Returns the first element of the sequence, optionally the first one
	 * matching a condition, without throwing when nothing is found.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The first matching element, or `null` when no element matches.
	 */
	firstOrNull(predicate?: Predicate<T>): T | null;

	/**
	 * Returns the last element of the sequence, optionally the last one
	 * matching a condition.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The last matching element.
	 * @throws {Error} When no element matches.
	 */
	last(predicate?: Predicate<T>): T;

	/**
	 * Returns the last element of the sequence, optionally the last one
	 * matching a condition, without throwing when nothing is found.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The last matching element, or `null` when no element matches.
	 */
	lastOrNull(predicate?: Predicate<T>): T | null;

	/**
	 * Counts the elements of the sequence, optionally restricted to the ones
	 * matching a condition.
	 *
	 * @param predicate Optional condition the counted elements must satisfy.
	 * @returns The amount of matching elements.
	 */
	count(predicate?: Predicate<T>): number;

	/**
	 * Determines whether the sequence contains any element, optionally any
	 * element matching a condition.
	 *
	 * @param predicate Optional condition the elements are tested against.
	 * @returns `true` when at least one element matches, otherwise `false`.
	 */
	any(predicate?: Predicate<T>): boolean;

	/**
	 * Groups the elements sharing the same key.
	 *
	 * @template K Type of the grouping key.
	 * @template R Type of the grouped elements. Defaults to `T`.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection applied to each grouped
	 * element. When omitted the original element is kept.
	 * @returns A deferred sequence of {@link Group} instances, preserving the
	 * order in which the keys were first seen.
	 */
	groupBy<K, R = T>(
		keySelector: Selector<T, K>,
		elementSelector?: Selector<T, R>,
	): Sequence<Group<K, R>>;

	/**
	 * Takes the leading elements of the sequence.
	 *
	 * @param count Maximum amount of elements to take. Values lower than or
	 * equal to `0` produce an empty sequence.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	take(count: number): Sequence<T>;

	/**
	 * Bypasses the leading elements of the sequence.
	 *
	 * @param count Amount of elements to bypass.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skip(count: number): Sequence<T>;

	/**
	 * Sorts the sequence in ascending order according to a key.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence that accepts secondary criteria.
	 */
	orderBy<K>(keySelector: Selector<T, K>): OrderedSequence<T>;

	/**
	 * Sorts the sequence in descending order according to a key.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence that accepts secondary criteria.
	 */
	orderByDescending<K>(keySelector: Selector<T, K>): OrderedSequence<T>;

	/**
	 * Materializes the sequence into an array.
	 *
	 * @returns A new array holding every element of the sequence.
	 */
	toArray(): Array<T>;

	/**
	 * Removes the duplicated elements of the sequence using reference or value
	 * equality, as implemented by `Set`.
	 *
	 * @returns A deferred sequence without duplicates.
	 */
	distinct(): Sequence<T>;

	/**
	 * Concatenates this sequence with another one, discarding duplicates.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the distinct elements of both sources.
	 */
	union(second: Iterable<T>): Sequence<T>;

	/**
	 * Keeps only the elements present in both sequences.
	 *
	 * @param second Sequence intersected with this one.
	 * @returns A deferred sequence with the distinct common elements.
	 */
	intersect(second: Iterable<T>): Sequence<T>;

	/**
	 * Sums the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The total, or `0` when the sequence is empty.
	 */
	sum(selector?: Selector<T, number>): number;

	/**
	 * Averages the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The arithmetic mean of the values.
	 * @throws {Error} When the sequence is empty.
	 */
	average(selector?: Selector<T, number>): number;

	/**
	 * Finds the smallest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The smallest value.
	 * @throws {Error} When the sequence is empty.
	 */
	min(selector?: Selector<T, number>): number;

	/**
	 * Finds the largest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The largest value.
	 * @throws {Error} When the sequence is empty.
	 */
	max(selector?: Selector<T, number>): number;

	/**
	 * Materializes the sequence into a map keyed by a projection.
	 *
	 * @template K Type of the map keys.
	 * @template R Type of the map values. Defaults to `T`.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection returning the value stored for
	 * each element. When omitted the original element is stored.
	 * @returns A new map holding every element of the sequence.
	 * @throws {Error} When two elements produce the same key.
	 */
	toMap<K, R = T>(
		keySelector: Selector<T, K>,
		elementSelector?: Selector<T, R>,
	): Map<K, R>;

	/**
	 * Runs an action for every element of the sequence.
	 *
	 * @param action Action invoked with each element and its index.
	 */
	forEach(action: Action<T>): void;

	/**
	 * Correlates the elements of two sequences sharing the same key, in the
	 * same fashion as a relational inner join.
	 *
	 * @template I Type of the inner elements.
	 * @template K Type of the correlation key.
	 * @template R Type of the produced results.
	 * @param innerCollection Sequence joined with this one.
	 * @param outerKeySelector Projection returning the key of each element of
	 * this sequence.
	 * @param innerKeySelector Projection returning the key of each element of
	 * `innerCollection`.
	 * @param resultSelector Projection merging each matching pair.
	 * @returns A deferred sequence with one result per matching pair.
	 */
	join<I, K, R>(
		innerCollection: Iterable<I>,
		outerKeySelector: Selector<T, K>,
		innerKeySelector: Selector<I, K>,
		resultSelector: ResultSelector<T, I, R>,
	): Sequence<R>;

	/**
	 * Reduces the sequence into a single value.
	 *
	 * @template A Type of the accumulated value. Defaults to `T`.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @returns The final accumulated value.
	 */
	aggregate<A = T>(seed: A, callback: Accumulator<A, T>): A;
}
