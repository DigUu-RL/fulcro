import { Group } from '@/@types/collections/group';
import { OrderedSequence, SortCriterion } from '@/@types/collections/ordered';

/**
 * Builds a {@link Group} instance.
 *
 * The base sequence implementation depends on this contract instead of
 * depending on the concrete group class, which keeps the module graph acyclic.
 *
 * @template K Type of the key shared by the elements.
 * @template T Type of the grouped elements.
 * @param key Key shared by every element of the group.
 * @param source Elements belonging to the group.
 * @returns The created group.
 */
export type GroupFactory = <K, T>(key: K, source: Iterable<T>) => Group<K, T>;

/**
 * Builds an {@link OrderedSequence} instance.
 *
 * The base sequence implementation depends on this contract instead of
 * depending on the concrete ordered class, which keeps the module graph
 * acyclic.
 *
 * @template T Type of the elements contained in the sequence.
 * @param source Sequence to be sorted.
 * @param criteria Sorting criteria applied in order of precedence.
 * @returns The created ordered sequence.
 */
export type OrderedSequenceFactory = <T>(
	source: Iterable<T>,
	criteria: readonly SortCriterion<T>[],
) => OrderedSequence<T>;

/**
 * Concrete implementations wired into the factory registry by the composition
 * root of the library.
 */
export interface CollectionFactories {
	/** Factory producing {@link Group} instances. */
	readonly group: GroupFactory;

	/** Factory producing {@link OrderedSequence} instances. */
	readonly ordered: OrderedSequenceFactory;
}
