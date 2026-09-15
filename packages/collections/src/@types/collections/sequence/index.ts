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

	/**
	 * Determines whether every element satisfies a condition.
	 *
	 * Stops at the first element that does not, so a failing condition costs
	 * only as much of the sequence as it takes to find one counterexample.
	 *
	 * An empty sequence satisfies any condition, which is the convention
	 * everywhere this operator exists and the only answer that keeps
	 * `all(p)` and `!any(not p)` the same statement.
	 *
	 * @param predicate Condition every element must satisfy.
	 * @returns `true` when no element fails the condition.
	 */
	all(predicate: Predicate<T>): boolean;

	/**
	 * Determines whether the sequence contains an element.
	 *
	 * Compared by reference or value as `Set` and `===` do, so an object is
	 * found only when it is the same object. Use {@link Sequence.any} with a
	 * predicate to match on content.
	 *
	 * @param value Element searched for.
	 * @returns `true` when the element is present.
	 */
	contains(value: T): boolean;

	/**
	 * Returns the only element of the sequence, optionally the only one
	 * matching a condition.
	 *
	 * Where {@link Sequence.first} asks for one of possibly many, this asserts
	 * there is exactly one — a second match is as much of an error as none, and
	 * is what separates the two operators.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The single matching element.
	 * @throws {Error} When no element matches, or more than one does.
	 */
	single(predicate?: Predicate<T>): T;

	/**
	 * Returns the only element of the sequence, optionally the only one
	 * matching a condition, without throwing when there is none.
	 *
	 * Still throws when more than one element matches: an ambiguous answer is a
	 * defect in the query rather than an absence to be tolerated.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The single matching element, or `null` when none matches.
	 * @throws {Error} When more than one element matches.
	 */
	singleOrNull(predicate?: Predicate<T>): T | null;

	/**
	 * Reads the element at a position.
	 *
	 * The same traversal as indexing the sequence, but stated as a call and
	 * loud when the position is out of range.
	 *
	 * @param index Zero based position of the element.
	 * @returns The element at that position.
	 * @throws {Error} When the position is out of range.
	 */
	elementAt(index: number): T;

	/**
	 * Reads the element at a position without throwing when out of range.
	 *
	 * @param index Zero based position of the element.
	 * @returns The element, or `null` when the position is out of range.
	 */
	elementAtOrNull(index: number): T | null;

	/**
	 * Substitutes a single fallback element for an empty sequence.
	 *
	 * Leaves a non empty sequence exactly as it is, so a query that must not
	 * produce nothing can say so without branching on a count first.
	 *
	 * @param fallback Element yielded when the sequence is empty.
	 * @returns A deferred sequence that is never empty.
	 */
	defaultIfEmpty(fallback: T): Sequence<T>;

	/**
	 * Determines whether two sequences hold the same elements in the same
	 * order.
	 *
	 * Traverses both in step and stops at the first difference, so unequal
	 * sequences usually cost far less than a full pass.
	 *
	 * @param second Sequence compared with this one.
	 * @returns `true` when both yield equal elements in the same order.
	 */
	sequenceEqual(second: Iterable<T>): boolean;

	/**
	 * Removes the elements that also appear in another sequence.
	 *
	 * The result is distinct, as it is for {@link Sequence.union} and
	 * {@link Sequence.intersect}: these are set operations, and a set does not
	 * hold an element twice.
	 *
	 * `second` is read in full on the first element pulled, because there is no
	 * way to know whether an element is absent from it without having seen all
	 * of it.
	 *
	 * @param second Sequence whose elements are removed from this one.
	 * @returns A deferred sequence with the distinct elements not in `second`.
	 */
	except(second: Iterable<T>): Sequence<T>;

	/**
	 * Appends another sequence to this one, keeping every element.
	 *
	 * Unlike {@link Sequence.union}, duplicates survive — this is
	 * concatenation, not a set operation.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the elements of both, in order.
	 */
	concat(second: Iterable<T>): Sequence<T>;

	/**
	 * Takes the leading elements while a condition holds.
	 *
	 * Stops at the first element that fails, and never looks past it — which is
	 * what separates this from {@link Sequence.where}, where a later match
	 * would still be kept.
	 *
	 * @param predicate Condition the leading elements satisfy.
	 * @returns A deferred sequence with the leading matching elements.
	 */
	takeWhile(predicate: Predicate<T>): Sequence<T>;

	/**
	 * Bypasses the leading elements while a condition holds.
	 *
	 * Once an element fails the condition it and everything after it is kept,
	 * whether or not they would have satisfied it.
	 *
	 * @param predicate Condition the bypassed leading elements satisfy.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skipWhile(predicate: Predicate<T>): Sequence<T>;

	/**
	 * Takes the trailing elements of the sequence.
	 *
	 * Holds at most `count` elements at a time rather than the whole sequence,
	 * so it stays usable on a source far larger than memory.
	 *
	 * @param count Maximum amount of trailing elements to take. Values lower
	 * than or equal to `0` produce an empty sequence.
	 * @returns A deferred sequence with at most `count` trailing elements.
	 */
	takeLast(count: number): Sequence<T>;

	/**
	 * Drops the trailing elements of the sequence.
	 *
	 * @param count Amount of trailing elements to drop.
	 * @returns A deferred sequence without the last `count` elements.
	 */
	skipLast(count: number): Sequence<T>;

	/**
	 * Splits the sequence into arrays of a fixed size.
	 *
	 * The final chunk holds whatever is left and may be shorter; no padding is
	 * added, since a padded chunk would be indistinguishable from a full one.
	 *
	 * @param size Amount of elements per chunk.
	 * @returns A deferred sequence of arrays.
	 * @throws {Error} When `size` is not a positive integer.
	 */
	chunk(size: number): Sequence<T[]>;

	/**
	 * Reverses the order of the sequence.
	 *
	 * The only operator here that cannot stay lazy: the last element is needed
	 * first, so the source is read in full before anything is yielded.
	 *
	 * @returns A deferred sequence with the elements in reverse order.
	 */
	reverse(): Sequence<T>;

	/**
	 * Merges two sequences position by position.
	 *
	 * Stops as soon as either runs out, so the result is as long as the shorter
	 * of the two and the longer one is never read past that point.
	 *
	 * @template S Type of the elements of the second sequence.
	 * @template R Type of the produced results.
	 * @param second Sequence merged with this one.
	 * @param resultSelector Projection merging each pair.
	 * @returns A deferred sequence with one result per pair.
	 */
	zip<S, R>(
		second: Iterable<S>,
		resultSelector: ResultSelector<T, S, R>,
	): Sequence<R>;

	/**
	 * Adds elements to the end of the sequence.
	 *
	 * @param values Elements appended, in the order given.
	 * @returns A deferred sequence ending with those elements.
	 */
	append(...values: readonly T[]): Sequence<T>;

	/**
	 * Adds elements to the start of the sequence.
	 *
	 * @param values Elements prepended, in the order given.
	 * @returns A deferred sequence starting with those elements.
	 */
	prepend(...values: readonly T[]): Sequence<T>;

	/**
	 * Removes the duplicated elements, comparing by a key rather than by the
	 * element itself.
	 *
	 * The first element seen for a key is the one kept, so the result follows
	 * the order of the source.
	 *
	 * @template K Type of the key elements are compared by.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per distinct key.
	 */
	distinctBy<K>(keySelector: Selector<T, K>): Sequence<T>;

	/**
	 * Finds the element with the smallest key.
	 *
	 * Returns the *element*, where {@link Sequence.min} returns the value — the
	 * usual reason to reach for this one is wanting the object that carried the
	 * smallest number, not the number.
	 *
	 * Keys are compared with `<`, so they must be mutually comparable: numbers,
	 * strings and dates all are.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns The element whose key is smallest, the first of them on a tie.
	 * @throws {Error} When the sequence is empty.
	 */
	minBy<K>(keySelector: Selector<T, K>): T;

	/**
	 * Finds the element with the largest key.
	 *
	 * @template K Type of the compared key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns The element whose key is largest, the first of them on a tie.
	 * @throws {Error} When the sequence is empty.
	 */
	maxBy<K>(keySelector: Selector<T, K>): T;

	/**
	 * Removes the elements whose key appears in a sequence of keys.
	 *
	 * Takes keys rather than elements, which is what makes it useful: the
	 * exclusion list rarely holds the same shape as the sequence being
	 * filtered — a list of identifiers against a list of records.
	 *
	 * @template K Type of the compared key.
	 * @param second Keys to exclude.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per remaining key.
	 */
	exceptBy<K>(second: Iterable<K>, keySelector: Selector<T, K>): Sequence<T>;

	/**
	 * Concatenates two sequences, discarding elements whose key was already
	 * seen.
	 *
	 * @template K Type of the compared key.
	 * @param second Sequence appended to this one.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per distinct key.
	 */
	unionBy<K>(second: Iterable<T>, keySelector: Selector<T, K>): Sequence<T>;

	/**
	 * Keeps the elements whose key appears in a sequence of keys.
	 *
	 * @template K Type of the compared key.
	 * @param second Keys to keep.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred sequence with one element per matching key.
	 */
	intersectBy<K>(second: Iterable<K>, keySelector: Selector<T, K>): Sequence<T>;

	/**
	 * Counts how many elements share each key.
	 *
	 * Cheaper than grouping when only the sizes are wanted, since the elements
	 * themselves are never collected.
	 *
	 * @template K Type of the grouping key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A map of key to count, in the order the keys were first seen.
	 */
	countBy<K>(keySelector: Selector<T, K>): Map<K, number>;

	/**
	 * Correlates each element with all the inner elements sharing its key.
	 *
	 * Where {@link Sequence.join} produces one result per matching pair, this
	 * produces one per element of *this* sequence, handing the matches over as
	 * a group — so an element with no match still appears, with an empty group.
	 * That is the difference between an inner join and a left outer one.
	 *
	 * @template I Type of the inner elements.
	 * @template K Type of the correlation key.
	 * @template R Type of the produced results.
	 * @param innerCollection Sequence correlated with this one.
	 * @param outerKeySelector Projection returning the key of each element of
	 * this sequence.
	 * @param innerKeySelector Projection returning the key of each element of
	 * `innerCollection`.
	 * @param resultSelector Projection merging an element with its matches.
	 * @returns A deferred sequence with one result per element of this
	 * sequence.
	 */
	groupJoin<I, K, R>(
		innerCollection: Iterable<I>,
		outerKeySelector: Selector<T, K>,
		innerKeySelector: Selector<I, K>,
		resultSelector: (outer: T, inner: Sequence<I>) => R,
	): Sequence<R>;

	/**
	 * Materializes the sequence into a map of key to every element sharing it.
	 *
	 * The one-to-many counterpart of {@link Sequence.toMap}, which rejects a
	 * duplicate key rather than collecting it.
	 *
	 * @template K Type of the map keys.
	 * @template R Type of the collected values. Defaults to `T`.
	 * @param keySelector Projection returning the key of each element.
	 * @param elementSelector Optional projection applied to each element.
	 * @returns A map of key to the elements sharing it, in first-seen order.
	 */
	toLookup<K, R = T>(
		keySelector: Selector<T, K>,
		elementSelector?: Selector<T, R>,
	): Map<K, R[]>;

	/**
	 * Materializes the sequence into a set, discarding duplicates.
	 *
	 * @returns A new set holding the distinct elements of the sequence.
	 */
	toSet(): Set<T>;
}
