import type { Predicate, Selector } from '@/src/@types';
import type { OrderedSequence, SortCriterion } from '@/src/@types/collections/ordered';
import type { Sequence } from '@/src/@types/collections/sequence';
import { SequenceCollection } from '@/src/collections/sequence/sequence.collection';

/**
 * Implementation of {@link OrderedSequence}: a sequence carrying its sorting
 * criteria.
 *
 * Sorting is deferred. The unsorted origin and the criteria are kept side by
 * side so that `thenBy` and `thenByDescending` can rebuild a single sort pass
 * with every criterion, instead of sorting an already sorted sequence again.
 *
 * The base class is imported from its implementation module (never from the
 * `@/collections/sequence` barrel) to keep the module graph acyclic.
 *
 * @template T Type of the elements contained in the sequence.
 */
export class OrderedSequenceCollection<T>
	extends SequenceCollection<T>
	implements OrderedSequence<T>
{
	/** Unsorted sequence the sorting criteria are applied to. */
	private readonly origin: Iterable<T>;

	/** Sorting criteria applied in order of precedence. */
	private readonly criteria: readonly SortCriterion<T>[];

	/**
	 * Initializes the ordered sequence.
	 *
	 * Kept private on purpose: ordered sequences are created through
	 * {@link OrderedSequenceCollection.createOrderedProxy} so that every
	 * instance is properly wrapped in its `Proxy`.
	 *
	 * @param source Sequence to be sorted.
	 * @param criteria Sorting criteria applied in order of precedence.
	 */
	private constructor(source: Iterable<T>, criteria: readonly SortCriterion<T>[]) {
		super(
			{
				// A plain method rather than a generator: the sort has to
				// materialize the whole sequence anyway, so handing out the
				// iterator of the sorted array costs one frame instead of
				// suspending and resuming a generator once per element.
				[Symbol.iterator]: (): Iterator<T> => {
					return OrderedSequenceCollection.sort(source, criteria)[Symbol.iterator]();
				},
			},
			// Sorting rearranges the elements without adding or removing any,
			// so whatever the origin knows about its size still holds.
			() => SequenceCollection.resolveKnownCount(source),
		);

		this.origin = source;
		this.criteria = criteria;
	}

	/**
	 * Sorts a sequence according to its criteria.
	 *
	 * Every key is extracted exactly once per element and per criterion, and
	 * the comparison then runs over those cached keys. Comparing the elements
	 * directly would call each projection twice per comparison instead, turning
	 * `O(n)` projections into `O(n log n)` — the dominant cost whenever the
	 * projection is more than a property read.
	 *
	 * What is sorted is the original positions, which keep the cached keys
	 * addressable. Each element is then written to the place its position
	 * landed on, rather than read back by index — an index the compiler could
	 * not prove present without an assertion. Sorting an object per element
	 * instead measured 1.55 times slower over a million elements.
	 *
	 * @template T Type of the sorted elements.
	 * @param source Sequence to be sorted.
	 * @param criteria Sorting criteria applied in order of precedence.
	 * @returns A new array holding the sorted elements.
	 */
	private static sort<T>(source: Iterable<T>, criteria: readonly SortCriterion<T>[]): T[] {
		const elements: T[] = SequenceCollection.materialize(source);
		const length: number = elements.length;

		if (length < 2 || criteria.length === 0) return elements;

		// Each key is computed once per element and criterion, before the sort,
		// rather than once per comparison, which runs O(n log n) times.
		const comparers: { readonly keys: readonly unknown[]; readonly direction: number }[] =
			criteria.map((criterion) => {
				const keySelector: Selector<T, unknown> = criterion.keySelector;

				return {
					keys: elements.map((element) => keySelector(element)),
					direction: criterion.descending ? -1 : 1,
				};
			});

		// Plain arrays, filled by hand rather than by `map`: a source that is a
		// subclass of Array would otherwise hand its own class, and its own
		// iterator, down to the sorted result.
		const positions: number[] = new Array<number>(length);

		for (let position = 0; position < length; position++) positions[position] = position;

		const criteriaCount: number = comparers.length;

		// An indexed loop rather than `for...of`: this runs O(n log n) times, and
		// the iterator measured about a tenth slower over a million elements.
		positions.sort((left, right) => {
			for (let index = 0; index < criteriaCount; index++) {
				const comparer = comparers[index];

				if (comparer === undefined) break;

				const leftKey = comparer.keys[left] as never;
				const rightKey = comparer.keys[right] as never;

				if (leftKey > rightKey) return comparer.direction;
				if (leftKey < rightKey) return -comparer.direction;
			}

			// Equivalent under every criterion: the original positions keep the
			// sort stable regardless of the engine implementation.
			return left - right;
		});

		// Each element is scattered to its place rather than gathered by its
		// position, so no element is ever read back by an index.
		const places: Uint32Array = new Uint32Array(length);

		positions.forEach((position, place) => {
			places[position] = place;
		});

		const sorted: T[] = new Array<T>(length);

		elements.forEach((element, position) => {
			const place: number | undefined = places[position];

			// Every position below `length` was given a place just above.
			if (place !== undefined) sorted[place] = element;
		});

		return sorted;
	}

	/**
	 * Creates a proxied ordered sequence, mirroring the factories of the
	 * sibling collections.
	 *
	 * @template T Type of the elements contained in the sequence.
	 * @param source Sequence to be sorted.
	 * @param criteria Sorting criteria applied in order of precedence.
	 * @returns The proxied ordered sequence.
	 */
	static createOrderedProxy<T>(
		source: Iterable<T>,
		criteria: readonly SortCriterion<T>[],
	): OrderedSequence<T> {
		const instance = new OrderedSequenceCollection<T>(source, criteria);

		return SequenceCollection.createIndexedProxy<T, OrderedSequenceCollection<T>>(instance);
	}

	/**
	 * Views the elements in their original order, skipping the sort.
	 *
	 * Backs the aggregates whose result cannot depend on the order of the
	 * elements: sorting before answering them would pay `O(n log n)` and a full
	 * materialization for a value that is provably identical either way.
	 *
	 * @returns The unsorted origin as a sequence.
	 */
	private get unordered(): Sequence<T> {
		return SequenceCollection.from(this.origin);
	}

	/**
	 * Counts the elements of the sequence, optionally restricted to the ones
	 * matching a condition.
	 *
	 * @param predicate Optional condition the counted elements must satisfy.
	 * @returns The amount of matching elements.
	 */
	override count(predicate?: Predicate<T>): number {
		return this.unordered.count(predicate);
	}

	/**
	 * Determines whether the sequence contains any element, optionally any
	 * element matching a condition.
	 *
	 * @param predicate Optional condition the elements are tested against.
	 * @returns `true` when at least one element matches, otherwise `false`.
	 */
	override any(predicate?: Predicate<T>): boolean {
		return this.unordered.any(predicate);
	}

	/**
	 * Sums the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @returns The total, or `0` when the sequence is empty.
	 */
	override sum(selector?: Selector<T, number>): number {
		return this.unordered.sum(selector);
	}

	/**
	 * Averages the numeric values of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @returns The arithmetic mean of the values.
	 * @throws {Error} When the sequence is empty.
	 */
	override average(selector?: Selector<T, number>): number {
		return this.unordered.average(selector);
	}

	/**
	 * Finds the smallest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @returns The smallest value.
	 * @throws {Error} When the sequence is empty.
	 */
	override min(selector?: Selector<T, number>): number {
		return this.unordered.min(selector);
	}

	/**
	 * Finds the largest numeric value of the sequence.
	 *
	 * @param selector Optional projection returning the value of each element.
	 * @returns The largest value.
	 * @throws {Error} When the sequence is empty.
	 */
	override max(selector?: Selector<T, number>): number {
		return this.unordered.max(selector);
	}

	/**
	 * Appends an ascending secondary sorting criterion.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence including the new criterion.
	 */
	thenBy<K>(keySelector: Selector<T, K>): OrderedSequence<T> {
		return OrderedSequenceCollection.createOrderedProxy(this.origin, [
			...this.criteria,
			{ keySelector, descending: false },
		]);
	}

	/**
	 * Appends a descending secondary sorting criterion.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence including the new criterion.
	 */
	thenByDescending<K>(keySelector: Selector<T, K>): OrderedSequence<T> {
		return OrderedSequenceCollection.createOrderedProxy(this.origin, [
			...this.criteria,
			{ keySelector, descending: true },
		]);
	}
}
