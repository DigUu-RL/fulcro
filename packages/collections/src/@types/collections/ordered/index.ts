import { Selector } from '@/@types';
import { Sequence } from '@/@types/collections/sequence';

/**
 * A single sorting criterion of an {@link OrderedSequence}.
 *
 * The criterion is kept as the projection that produces the key, rather than as
 * a ready made comparison function, so that the sort can extract every key once
 * — `O(n)` calls — instead of calling the projection twice per comparison, which
 * would grow as `O(n log n)`.
 *
 * @template T Type of the sorted elements.
 */
export interface SortCriterion<T> {
	/** Projection returning the key each element is sorted by. */
	readonly keySelector: Selector<T, unknown>;

	/** Whether the criterion sorts from the largest key to the smallest. */
	readonly descending: boolean;
}

/**
 * A sequence carrying its sorting criteria, as produced by
 * {@link Sequence.orderBy} and {@link Sequence.orderByDescending}.
 *
 * Secondary criteria are appended with {@link OrderedSequence.thenBy} and
 * {@link OrderedSequence.thenByDescending}, and are only considered when the
 * previous criteria consider two elements equivalent.
 *
 * @template T Type of the elements contained in the sequence.
 */
export interface OrderedSequence<T> extends Sequence<T> {
	/**
	 * Appends an ascending secondary sorting criterion.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence including the new criterion.
	 */
	thenBy<K>(keySelector: Selector<T, K>): OrderedSequence<T>;

	/**
	 * Appends a descending secondary sorting criterion.
	 *
	 * @template K Type of the sorting key.
	 * @param keySelector Projection returning the key of each element.
	 * @returns A deferred ordered sequence including the new criterion.
	 */
	thenByDescending<K>(keySelector: Selector<T, K>): OrderedSequence<T>;
}
