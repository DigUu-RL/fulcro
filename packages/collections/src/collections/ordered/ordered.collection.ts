import { Predicate, Selector } from '@/@types';
import { OrderedSequence, SortCriterion } from '@/@types/collections/ordered';
import { Sequence } from '@/@types/collections/sequence';
import { SequenceCollection } from '@/collections/sequence/sequence.collection';

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
	private constructor(
		source: Iterable<T>,
		criteria: readonly SortCriterion<T>[],
	) {
		super(
			{
				// A plain method rather than a generator: the sort has to
				// materialize the whole sequence anyway, so handing out the
				// iterator of the sorted array costs one frame instead of
				// suspending and resuming a generator once per element.
				[Symbol.iterator]: (): Iterator<T> =>
					OrderedSequenceCollection.sort(source, criteria)[Symbol.iterator](),
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
	 * What is sorted is an array of positions rather than the elements: it
	 * keeps the cached keys addressable by index, and makes the sort move
	 * integers instead of whole objects.
	 *
	 * @template T Type of the sorted elements.
	 * @param source Sequence to be sorted.
	 * @param criteria Sorting criteria applied in order of precedence.
	 * @returns A new array holding the sorted elements.
	 */
	private static sort<T>(
		source: Iterable<T>,
		criteria: readonly SortCriterion<T>[],
	): T[] {
		const elements: T[] = SequenceCollection.materialize(source);
		const length: number = elements.length;

		if (length < 2 || criteria.length === 0) return elements;

		const criteriaCount: number = criteria.length;
		const keys: unknown[][] = new Array<unknown[]>(criteriaCount);
		const directions: Int8Array = new Int8Array(criteriaCount);

		for (
			let criterionIndex = 0;
			criterionIndex < criteriaCount;
			criterionIndex++
		) {
			const criterion: SortCriterion<T> = criteria[criterionIndex];
			const keySelector: Selector<T, unknown> = criterion.keySelector;
			const extracted: unknown[] = new Array<unknown>(length);

			for (let index = 0; index < length; index++) {
				extracted[index] = keySelector(elements[index]);
			}

			keys[criterionIndex] = extracted;
			directions[criterionIndex] = criterion.descending ? -1 : 1;
		}

		const positions: number[] = new Array<number>(length);
		for (let index = 0; index < length; index++) positions[index] = index;

		positions.sort((left, right) => {
			for (
				let criterionIndex = 0;
				criterionIndex < criteriaCount;
				criterionIndex++
			) {
				const extracted: unknown[] = keys[criterionIndex];
				const leftKey = extracted[left] as never;
				const rightKey = extracted[right] as never;

				if (leftKey > rightKey) return directions[criterionIndex];
				if (leftKey < rightKey) return -directions[criterionIndex];
			}

			// Equivalent under every criterion: the original positions keep the
			// sort stable regardless of the engine implementation.
			return left - right;
		});

		const sorted: T[] = new Array<T>(length);
		for (let index = 0; index < length; index++) {
			sorted[index] = elements[positions[index]];
		}

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

		return SequenceCollection.createIndexedProxy<
			T,
			OrderedSequenceCollection<T>
		>(instance);
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
