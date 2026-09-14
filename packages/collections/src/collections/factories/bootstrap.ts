import {
	hasCollectionFactories,
	registerCollectionFactories,
} from '@/collections/factories';
import { GroupCollection } from '@/collections/group/group.collection';
import { OrderedSequenceCollection } from '@/collections/ordered/ordered.collection';

/**
 * Composition root of the library.
 *
 * `SequenceCollection` creates groups and ordered sequences through the
 * factory registry, and this module is the single place where the concrete
 * classes are plugged into it. Because only this module knows about all three
 * classes at once, no class module needs to import another one in both
 * directions, which is what keeps the import graph acyclic while every class
 * lives in its own file.
 *
 * Every public barrel of the library calls this function before exporting, so
 * consumers never have to wire anything by hand.
 *
 * The call is idempotent: subsequent calls are ignored.
 */
export const bootstrapCollections = (): void => {
	if (hasCollectionFactories()) return;

	registerCollectionFactories({
		group: GroupCollection.createGroupProxy,
		ordered: OrderedSequenceCollection.createOrderedProxy,
	});
};
