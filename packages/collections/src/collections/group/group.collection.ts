import { Group } from '@/@types/collections/group';
import { SequenceCollection } from '@/collections/sequence/sequence.collection';

/**
 * Implementation of {@link Group}: a sequence of elements sharing the same key.
 *
 * Instances are produced by `groupBy` through
 * {@link GroupCollection.createGroupProxy}, so a group behaves exactly like any
 * other sequence of the library, positional access included.
 *
 * The base class is imported from its implementation module (never from the
 * `@/collections/sequence` barrel) to keep the module graph acyclic.
 *
 * @template K Type of the key shared by the elements.
 * @template T Type of the grouped elements.
 */
export class GroupCollection<K, T>
	extends SequenceCollection<T>
	implements Group<K, T>
{
	/** Key shared by every element of the group. */
	public readonly key: K;

	/**
	 * Initializes the group.
	 *
	 * Kept private on purpose: groups are created through
	 * {@link GroupCollection.createGroupProxy} so that every instance is
	 * properly wrapped in its `Proxy`.
	 *
	 * @param key Key shared by every element of the group.
	 * @param source Elements belonging to the group.
	 */
	private constructor(key: K, source: Iterable<T>) {
		super(source);
		this.key = key;
	}

	/**
	 * Creates a proxied group, mirroring the factories of the sibling
	 * collections.
	 *
	 * @template K Type of the key shared by the elements.
	 * @template T Type of the grouped elements.
	 * @param key Key shared by every element of the group.
	 * @param source Elements belonging to the group.
	 * @returns The proxied group.
	 */
	static createGroupProxy<K, T>(key: K, source: Iterable<T>): Group<K, T> {
		const instance = new GroupCollection<K, T>(key, source);

		return SequenceCollection.createIndexedProxy<T, GroupCollection<K, T>>(
			instance,
		);
	}
}
