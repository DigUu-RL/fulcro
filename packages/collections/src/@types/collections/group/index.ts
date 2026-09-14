import { Sequence } from '@/@types/collections/sequence';

/**
 * A sequence of elements sharing the same key, as produced by
 * {@link Sequence.groupBy}.
 *
 * A group is a fully featured {@link Sequence}, so every query operator can
 * be chained directly on it.
 *
 * @template K Type of the key shared by the elements.
 * @template T Type of the grouped elements.
 */
export interface Group<K, T> extends Sequence<T> {
	/** Key shared by every element of the group. */
	readonly key: K;
}
