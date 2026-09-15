import {
	Accumulator,
	Action,
	Predicate,
	ResultSelector,
	Selector,
} from '@/@types';
import { Sequence } from '@/@types/collections/sequence';
import { Group } from '@/@types/collections/group';
import { OrderedSequence } from '@/@types/collections/ordered';
import { createGroup, createOrderedSequence } from '@/collections/factories';
import { isIndexKey, resolveDeclaredCount } from '@/functions/collections';

/**
 * Cardinality resolver of the operators whose result depends on the data, such
 * as `where` and `distinct`: their sequences can only be counted by traversing
 * them.
 */
const UNKNOWN_COUNT = (): null => null;

/**
 * Marks the absence of a match in the internal lookups, so that an element
 * which is itself `null` or `undefined` is never mistaken for one.
 */
const NOT_FOUND = Symbol('not-found');

/**
 * Base implementation of {@link Sequence}, shared by every collection of the
 * library.
 *
 * Instances are always handed out wrapped in a `Proxy` so that positional
 * access (`collection[0]`) works alongside the query operators. Query operators
 * returning another sequence are deferred: they describe the traversal and only
 * consume the source once the resulting sequence is iterated.
 *
 * This module must not import the derived collections. It depends on
 * `@/collections/factories` instead, which is what keeps `GroupCollection` and
 * `OrderedSequenceCollection` in their own files without an import cycle.
 *
 * @template T Type of the elements contained in the sequence.
 */
export class SequenceCollection<T> implements Sequence<T> {
	/** Underlying source traversed by the sequence. */
	protected readonly source: Iterable<T>;

	/**
	 * How the sequence answers its own cardinality without traversing itself.
	 *
	 * Wired at construction time and carried through every operator preserving
	 * the cardinality of its source, so that `count` can answer in `O(1)` even
	 * after a chain such as `select().take()`. Operators whose result depends
	 * on the data — `where` and `distinct` among them — wire it to `null`
	 * instead of guessing.
	 *
	 * Kept as a thunk rather than a number so that the value is never frozen:
	 * the sequence never copies its source, so a source growing after the
	 * sequence was created must still be counted correctly.
	 */
	protected readonly countResolver: () => number | null;

	/**
	 * Positional access provided by the `Proxy` returned by the factories.
	 *
	 * @param index Zero based position of the element.
	 */
	[index: number]: T;

	/**
	 * Initializes the sequence.
	 *
	 * Kept protected on purpose: consumers create sequences through
	 * {@link SequenceCollection.from} and {@link SequenceCollection.empty}
	 * so that every instance is properly wrapped in its `Proxy`.
	 *
	 * @param source Underlying source traversed by the sequence.
	 * @param countResolver How the sequence answers its own cardinality, for
	 * callers able to derive it from their own source. Omitted by callers that
	 * cannot tell, in which case the source itself is asked.
	 */
	protected constructor(
		source: Iterable<T>,
		countResolver?: () => number | null,
	) {
		this.source = source;
		this.countResolver =
			countResolver ??
			((): number | null => SequenceCollection.resolveKnownCount(source));
	}

	/**
	 * Amount of elements of the sequence when it is known without traversing
	 * it, `null` otherwise.
	 *
	 * Read on every access rather than memoized, so that it keeps tracking
	 * sources that change after the sequence was created.
	 */
	protected get knownCount(): number | null {
		return this.countResolver();
	}

	/**
	 * Reads the amount of elements of a source without traversing it.
	 *
	 * Sequences of the library answer with the count they are already carrying;
	 * every other source is asked for its declared cardinality.
	 *
	 * @template T Type of the elements contained in the source.
	 * @param source Source being inspected.
	 * @returns The amount of elements, or `null` when it is unknown.
	 */
	protected static resolveKnownCount<T>(source: Iterable<T>): number | null {
		if (source instanceof SequenceCollection) return source.knownCount;

		return resolveDeclaredCount(source);
	}

	/**
	 * Traverses the underlying source.
	 *
	 * Hands out the iterator of the source instead of re-yielding its elements
	 * one by one: a generator delegating to another generator costs an extra
	 * suspension and resumption per element, and every operator of a chain adds
	 * one such layer. Forwarding keeps a chain of `n` operators at `n`
	 * generator frames rather than `2n`.
	 *
	 * @returns An iterator over the elements of the sequence.
	 */
	[Symbol.iterator](): Iterator<T, any, any> {
		return this.source[Symbol.iterator]();
	}

	/**
	 * Wraps an instance in the `Proxy` responsible for positional access.
	 *
	 * Numeric property names are resolved against the underlying source —
	 * directly when it is an array, otherwise by traversing it until the
	 * requested position is reached. Every other property, including symbols
	 * such as `Symbol.iterator`, is forwarded to the instance itself.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @template I Concrete type of the wrapped instance.
	 * @param instance Instance to wrap.
	 * @returns The wrapped instance, indistinguishable from the original one.
	 */
	protected static createIndexedProxy<T, I extends SequenceCollection<T>>(
		instance: I,
	): I {
		const handler: ProxyHandler<I> = {
			get(target: I, property: string | symbol, receiver: unknown) {
				if (isIndexKey(property)) {
					const index: number = Number(property);

					if (Array.isArray(target.source)) return target.source[index];

					let currentIndex: number = 0;

					for (const item of target) {
						if (currentIndex === index) return item;
						currentIndex++;
					}

					return undefined;
				}

				return Reflect.get(target, property, receiver);
			},
		};

		return new Proxy(instance, handler);
	}

	/**
	 * Creates a proxied sequence over a source.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Underlying source traversed by the sequence.
	 * @param countResolver How the sequence answers its own cardinality, when
	 * the caller can derive it.
	 * @returns The proxied sequence.
	 */
	private static createSequenceProxy<T>(
		source: Iterable<T>,
		countResolver?: () => number | null,
	): Sequence<T> {
		const instance = new SequenceCollection<T>(source, countResolver);

		return SequenceCollection.createIndexedProxy(instance) as Sequence<T>;
	}

	/**
	 * Creates a sequence over any iterable source.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Iterable wrapped by the sequence. It is never copied, so
	 * lazy sources stay lazy.
	 * @returns The created sequence.
	 */
	static from<T>(source: Iterable<T>): Sequence<T> {
		return SequenceCollection.createSequenceProxy(source);
	}

	/**
	 * Creates the deferred sequence returned by the query operators, carrying
	 * the cardinality the operator was able to derive from its own source.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Traversal described by the operator.
	 * @param countResolver Amount of elements the operator will yield, derived
	 * from its source on every call. Returns `null` when it depends on the
	 * data.
	 * @returns The deferred sequence.
	 */
	private static deferred<T>(
		source: Iterable<T>,
		countResolver: () => number | null,
	): Sequence<T> {
		return SequenceCollection.createSequenceProxy(source, countResolver);
	}

	/**
	 * Creates an empty sequence.
	 *
	 * @template T Type of the elements the sequence would contain.
	 * @returns An empty sequence.
	 */
	static empty<T>(): Sequence<T> {
		return SequenceCollection.createSequenceProxy<T>([]);
	}

	/**
	 * Filters the sequence keeping only the elements matching a condition.
	 *
	 * @param predicate Condition evaluated for each element.
	 * @returns A deferred sequence with the matching elements.
	 */
	where(predicate: Predicate<T>): Sequence<T> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					for (const item of source) {
						if (predicate(item)) yield item;
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Projects every element into a new shape.
	 *
	 * @template R Type produced by the projection.
	 * @param selector Projection applied to each element.
	 * @returns A deferred sequence with the projected elements.
	 */
	select<R>(selector: Selector<T, R>): Sequence<R> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<R> {
					for (const item of source) yield selector(item);
				},
			},
			() => this.knownCount,
		);
	}

	/**
	 * Projects every element into an iterable and flattens the results into a
	 * single sequence.
	 *
	 * @template R Type of the elements produced by the projection.
	 * @param selector Projection returning an iterable for each element.
	 * @returns A deferred sequence with all the inner elements concatenated.
	 */
	selectMany<R>(selector: Selector<T, Iterable<R>>): Sequence<R> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<R> {
					for (const item of source) {
						for (const subItem of selector(item)) yield subItem;
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Sorts the sequence in ascending order according to a key.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence that accepts secondary criteria.
	 */
	orderBy<K>(keySelector: Selector<T, K>): OrderedSequence<T> {
		return createOrderedSequence(this, [{ keySelector, descending: false }]);
	}

	/**
	 * Sorts the sequence in descending order according to a key.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence that accepts secondary criteria.
	 */
	orderByDescending<K>(keySelector: Selector<T, K>): OrderedSequence<T> {
		return createOrderedSequence(this, [{ keySelector, descending: true }]);
	}

	/**
	 * Returns the first element of the sequence, optionally the first one
	 * matching a condition.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The first matching element.
	 * @throws {Error} When no element matches.
	 */
	first(predicate?: Predicate<T>): T {
		for (const item of this.source) {
			if (!predicate || predicate(item)) return item;
		}

		throw new Error('Sequence contains no elements');
	}

	/**
	 * Returns the first element of the sequence, optionally the first one
	 * matching a condition, without throwing when nothing is found.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The first matching element, or `null` when no element matches.
	 */
	firstOrNull(predicate?: Predicate<T>): T | null {
		for (const item of this.source) {
			if (!predicate || predicate(item)) return item;
		}

		return null;
	}

	/**
	 * Returns the last element of the sequence, optionally the last one
	 * matching a condition.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The last matching element.
	 * @throws {Error} When no element matches.
	 */
	last(predicate?: Predicate<T>): T {
		const found: T | typeof NOT_FOUND = this.findLast(predicate);

		if (found === NOT_FOUND) throw new Error('Sequence contains no elements');

		return found;
	}

	/**
	 * Returns the last element of the sequence, optionally the last one
	 * matching a condition, without throwing when nothing is found.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The last matching element, or `null` when no element matches.
	 */
	lastOrNull(predicate?: Predicate<T>): T | null {
		const found: T | typeof NOT_FOUND = this.findLast(predicate);

		return found === NOT_FOUND ? null : found;
	}

	/**
	 * Finds the last element matching a condition.
	 *
	 * Array like sources are walked backwards, which turns an unfiltered `last`
	 * into a single read and lets a filtered one stop at the first match from
	 * the end instead of scanning the whole sequence. Anything else can only be
	 * traversed forwards, and is read exactly once so that single pass sources
	 * survive.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The last matching element, or {@link NOT_FOUND} when no element
	 * matches. The sentinel keeps an element that is itself `null` or
	 * `undefined` distinguishable from the absence of a match.
	 */
	private findLast(predicate?: Predicate<T>): T | typeof NOT_FOUND {
		const source: Iterable<T> = this.source;

		if (Array.isArray(source)) {
			for (let index = source.length - 1; index >= 0; index--) {
				const item: T = source[index];
				if (!predicate || predicate(item)) return item;
			}

			return NOT_FOUND;
		}

		let last: T | typeof NOT_FOUND = NOT_FOUND;

		for (const item of source) {
			if (!predicate || predicate(item)) last = item;
		}

		return last;
	}

	/**
	 * Counts the elements of the sequence, optionally restricted to the ones
	 * matching a condition.
	 *
	 * Unfiltered counts short circuit to {@link SequenceCollection.knownCount}
	 * whenever the cardinality was resolved at construction time, so they cost
	 * `O(1)` and, as a consequence, never consume single pass sources.
	 *
	 * @param predicate Optional condition the counted elements must satisfy.
	 * @returns The amount of matching elements.
	 */
	count(predicate?: Predicate<T>): number {
		if (!predicate && this.knownCount !== null) return this.knownCount;

		let counter = 0;

		for (const item of this.source) {
			if (!predicate || predicate(item)) counter++;
		}

		return counter;
	}

	/**
	 * Determines whether the sequence contains any element, optionally any
	 * element matching a condition.
	 *
	 * The traversal stops as soon as a match is found.
	 *
	 * @param predicate Optional condition the elements are tested against.
	 * @returns `true` when at least one element matches, otherwise `false`.
	 */
	any(predicate?: Predicate<T>): boolean {
		if (!predicate) {
			const known: number | null = this.knownCount;
			if (known !== null) return known > 0;

			return !this.source[Symbol.iterator]().next().done;
		}

		for (const item of this.source) {
			if (predicate(item)) return true;
		}

		return false;
	}

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
	): Sequence<Group<K, R>> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<Group<K, R>> {
					const map = new Map<K, R[]>();

					for (const item of source) {
						const key = keySelector(item);
						const element = elementSelector
							? elementSelector(item)
							: (item as unknown as R);

						// One hash lookup per element instead of the two a
						// `has` followed by a `get` would cost.
						const bucket = map.get(key);

						if (bucket === undefined) map.set(key, [element]);
						else bucket.push(element);
					}

					for (const [key, elements] of map.entries())
						yield createGroup(key, elements);
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Takes the leading elements of the sequence.
	 *
	 * @param count Maximum amount of elements to take. Values lower than or
	 * equal to `0` produce an empty sequence.
	 * @returns A deferred sequence with at most `count` elements.
	 */
	take(count: number): Sequence<T> {
		const source: Iterable<T> = this.source;
		const requested: number = Math.max(0, count);

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					if (count <= 0) return;

					let taken = 0;

					for (const item of source) {
						yield item;
						taken++;
						if (taken >= count) break;
					}
				},
			},
			() => {
				const available: number | null = this.knownCount;
				return available === null ? null : Math.min(requested, available);
			},
		);
	}

	/**
	 * Bypasses the leading elements of the sequence.
	 *
	 * @param count Amount of elements to bypass.
	 * @returns A deferred sequence with the remaining elements.
	 */
	skip(count: number): Sequence<T> {
		const source: Iterable<T> = this.source;
		const bypassed: number = Math.max(0, count);

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					const iterator: Iterator<T> = source[Symbol.iterator]();

					for (let skipped = 0; skipped < bypassed; skipped++) {
						if (iterator.next().done) return;
					}

					// Delegating the remainder drops the per element test that
					// a single loop would keep re-evaluating long after the
					// bypassed prefix is behind us, and still forwards early
					// termination back to the source iterator.
					yield* { [Symbol.iterator]: () => iterator };
				},
			},
			() => {
				const available: number | null = this.knownCount;
				return available === null ? null : Math.max(0, available - bypassed);
			},
		);
	}

	/**
	 * Materializes the sequence into an array.
	 *
	 * @returns A new array holding every element of the sequence.
	 */
	toArray(): T[] {
		return SequenceCollection.materialize(this.source);
	}

	/**
	 * Copies a source into a new array.
	 *
	 * Reaches the underlying array of a sequence wrapping another sequence
	 * before copying, because `slice` copies at the memory level while
	 * spreading pulls the elements through the iterator protocol one at a time
	 * — around eighteen times slower on a million elements.
	 *
	 * Unwrapping is only sound because {@link SequenceCollection} iterates by
	 * forwarding to its own source: a subclass overriding `[Symbol.iterator]`
	 * instead of feeding the constructor would silently be skipped here.
	 *
	 * @template T Type of the elements contained in the source.
	 * @param source Source being copied.
	 * @returns A new array holding every element of the source.
	 */
	protected static materialize<T>(source: Iterable<T>): T[] {
		if (Array.isArray(source)) return source.slice();

		if (source instanceof SequenceCollection)
			return SequenceCollection.materialize(source.source as Iterable<T>);

		return [...source];
	}

	/**
	 * Removes the duplicated elements of the sequence using reference or value
	 * equality, as implemented by `Set`.
	 *
	 * @returns A deferred sequence without duplicates.
	 */
	distinct(): Sequence<T> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					const seen = new Set<T>();

					for (const item of source) {
						// Adding and watching the size grow costs a single
						// hash operation, where a `has` guarding an `add`
						// would hash every element twice.
						const seenCount: number = seen.size;

						seen.add(item);
						if (seen.size !== seenCount) yield item;
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Concatenates this sequence with another one, discarding duplicates.
	 *
	 * @param second Sequence appended to this one.
	 * @returns A deferred sequence with the distinct elements of both sources.
	 */
	union(second: Iterable<T>): Sequence<T> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					const seen = new Set<T>();

					for (const item of source) {
						const seenCount: number = seen.size;

						seen.add(item);
						if (seen.size !== seenCount) yield item;
					}

					for (const item of second) {
						const seenCount: number = seen.size;

						seen.add(item);
						if (seen.size !== seenCount) yield item;
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Keeps only the elements present in both sequences.
	 *
	 * @param second Sequence intersected with this one.
	 * @returns A deferred sequence with the distinct common elements.
	 */
	intersect(second: Iterable<T>): Sequence<T> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					const remaining = new Set<T>(second);

					for (const item of source) {
						// Removing the element as it is emitted answers "is it
						// in the second sequence" and "was it emitted already"
						// with one hash operation, and spares the second set
						// that tracking the emitted elements would require.
						if (remaining.delete(item)) yield item;
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Sums the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The total, or `0` when the sequence is empty.
	 */
	sum(selector?: Selector<T, number>): number {
		let total = 0;

		for (const item of this.source) {
			total += selector ? selector(item) : (item as unknown as number);
		}

		return total;
	}

	/**
	 * Averages the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The arithmetic mean of the values.
	 * @throws {Error} When the sequence is empty.
	 */
	average(selector?: Selector<T, number>): number {
		let total = 0;
		let counter = 0;

		for (const item of this.source) {
			total += selector ? selector(item) : (item as unknown as number);
			counter++;
		}

		if (counter === 0) throw new Error('Sequence contains no elements');
		return total / counter;
	}

	/**
	 * Finds the smallest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The smallest value.
	 * @throws {Error} When the sequence is empty.
	 */
	min(selector?: Selector<T, number>): number {
		let minimum: number | null = null;

		for (const item of this.source) {
			const value = selector ? selector(item) : (item as unknown as number);

			if (minimum === null || value < minimum) minimum = value;
		}

		if (minimum === null) throw new Error('Sequence contains no elements');
		return minimum;
	}

	/**
	 * Finds the largest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * When omitted the elements themselves are treated as numbers.
	 * @returns The largest value.
	 * @throws {Error} When the sequence is empty.
	 */
	max(selector?: Selector<T, number>): number {
		let maximum: number | null = null;

		for (const item of this.source) {
			const value = selector ? selector(item) : (item as unknown as number);

			if (maximum === null || value > maximum) maximum = value;
		}

		if (maximum === null) throw new Error('Sequence contains no elements');
		return maximum;
	}

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
	): Map<K, R> {
		const map = new Map<K, R>();

		for (const item of this.source) {
			const key = keySelector(item);
			const element = elementSelector
				? elementSelector(item)
				: (item as unknown as R);

			// A `has` guarding the `set` would hash every key twice. Writing
			// first and checking that the map actually grew detects the
			// duplicate with a single hash operation, and the overwritten map
			// is thrown away along with the error.
			const storedCount: number = map.size;

			map.set(key, element);

			if (map.size === storedCount) {
				throw new Error('An item with the same key has already been added.');
			}
		}

		return map;
	}

	/**
	 * Runs an action for every element of the sequence.
	 *
	 * @param action Action invoked with each element and its index.
	 */
	forEach(action: Action<T>): void {
		let index = 0;

		for (const item of this.source) {
			action(item, index);
			index++;
		}
	}

	/**
	 * Correlates the elements of two sequences sharing the same key, in the
	 * same fashion as a relational inner join.
	 *
	 * The inner sequence is indexed by key before the outer one is traversed,
	 * so the join runs in linear time.
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
	): Sequence<R> {
		const source: Iterable<T> = this.source;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<R> {
					const map = new Map<K, I[]>();

					for (const innerItem of innerCollection) {
						const key = innerKeySelector(innerItem);
						const bucket = map.get(key);

						if (bucket === undefined) map.set(key, [innerItem]);
						else bucket.push(innerItem);
					}

					for (const outerItem of source) {
						const outerKey = outerKeySelector(outerItem);
						const matchingInnerItems = map.get(outerKey);

						if (matchingInnerItems) {
							for (const innerItem of matchingInnerItems) {
								yield resultSelector(outerItem, innerItem);
							}
						}
					}
				},
			},
			UNKNOWN_COUNT,
		);
	}

	/**
	 * Reduces the sequence into a single value.
	 *
	 * @template A Type of the accumulated value. Defaults to `T`.
	 * @param seed Initial accumulated value.
	 * @param callback Function merging the accumulated value with each element.
	 * @returns The final accumulated value.
	 */
	aggregate<A = T>(seed: A, callback: Accumulator<A, T>): A {
		let accumulator = seed;

		for (const item of this.source) accumulator = callback(accumulator, item);
		return accumulator;
	}

	/**
	 * Determines whether every element satisfies a condition.
	 *
	 * @param predicate Condition every element must satisfy.
	 * @returns `true` when no element fails the condition.
	 */
	all(predicate: Predicate<T>): boolean {
		// One counterexample settles it, so the rest is never read.
		for (const item of this.source) if (!predicate(item)) return false;

		return true;
	}

	/**
	 * Determines whether the sequence contains an element.
	 *
	 * @param value Element searched for.
	 * @returns `true` when the element is present.
	 */
	contains(value: T): boolean {
		for (const item of this.source) if (item === value) return true;

		return false;
	}

	/**
	 * Returns the only element of the sequence, optionally the only one
	 * matching a condition.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The single matching element.
	 * @throws {Error} When no element matches, or more than one does.
	 */
	single(predicate?: Predicate<T>): T {
		const found: T | null = this.resolveSingle(predicate);

		if (found === null)
			throw new Error('single() found no element matching the condition.');

		return found;
	}

	/**
	 * Returns the only element of the sequence, optionally the only one
	 * matching a condition, without throwing when there is none.
	 *
	 * @param predicate Optional condition the returned element must satisfy.
	 * @returns The single matching element, or `null` when none matches.
	 * @throws {Error} When more than one element matches.
	 */
	singleOrNull(predicate?: Predicate<T>): T | null {
		return this.resolveSingle(predicate);
	}

	/**
	 * Finds the one matching element, or reports that there was none.
	 *
	 * Shared by {@link SequenceCollection.single} and
	 * {@link SequenceCollection.singleOrNull}, which differ only in what they
	 * do about an absence. A second match throws for both: an ambiguous answer
	 * is a defect in the query, not an absence to tolerate.
	 *
	 * Traversal stops on the second match rather than draining the sequence,
	 * so the failure costs no more than the success.
	 *
	 * @param predicate Optional condition the element must satisfy.
	 * @returns The single matching element, or `null` when none matches.
	 * @throws {Error} When more than one element matches.
	 */
	private resolveSingle(predicate?: Predicate<T>): T | null {
		let found: T | null = null;
		let seen = false;

		for (const item of this.source) {
			if (predicate !== undefined && !predicate(item)) continue;

			if (seen)
				throw new Error(
					'single() found more than one element matching the condition.',
				);

			found = item;
			seen = true;
		}

		return seen ? found : null;
	}

	/**
	 * Reads the element at a position.
	 *
	 * @param index Zero based position of the element.
	 * @returns The element at that position.
	 * @throws {Error} When the position is out of range.
	 */
	elementAt(index: number): T {
		const found: T | null = this.elementAtOrNull(index);

		if (found === null) throw new Error(`elementAt(${index}) is out of range.`);

		return found;
	}

	/**
	 * Reads the element at a position without throwing when out of range.
	 *
	 * @param index Zero based position of the element.
	 * @returns The element, or `null` when the position is out of range.
	 */
	elementAtOrNull(index: number): T | null {
		if (!Number.isInteger(index) || index < 0) return null;

		let position = 0;

		for (const item of this.source) {
			if (position === index) return item;
			position++;
		}

		return null;
	}

	/**
	 * Substitutes a single fallback element for an empty sequence.
	 *
	 * @param fallback Element yielded when the sequence is empty.
	 * @returns A deferred sequence that is never empty.
	 */
	defaultIfEmpty(fallback: T): Sequence<T> {
		const source: Iterable<T> = this.source;
		const knownCount: () => number | null = this.countResolver;

		return SequenceCollection.deferred(
			{
				*[Symbol.iterator](): Iterator<T> {
					let empty = true;

					for (const item of source) {
						empty = false;
						yield item;
					}

					if (empty) yield fallback;
				},
			},
			// An empty source yields one element, so a known zero becomes one and
			// anything else is left as it was.
			() => {
				const count: number | null = knownCount();

				return count === null ? null : count === 0 ? 1 : count;
			},
		);
	}

	/**
	 * Determines whether two sequences hold the same elements in the same
	 * order.
	 *
	 * @param second Sequence compared with this one.
	 * @returns `true` when both yield equal elements in the same order.
	 */
	sequenceEqual(second: Iterable<T>): boolean {
		const left: Iterator<T> = this.source[Symbol.iterator]();
		const right: Iterator<T> = second[Symbol.iterator]();

		// Stepped together rather than materialised, so the first difference
		// ends the comparison and neither side is read past it.
		for (;;) {
			const a: IteratorResult<T> = left.next();
			const b: IteratorResult<T> = right.next();

			if (a.done === true || b.done === true) return a.done === b.done;
			if (a.value !== b.value) return false;
		}
	}
}
