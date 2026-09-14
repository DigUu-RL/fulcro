import { bootstrapCollections } from '@/collections/factories/bootstrap';

/**
 * Public entry point of the group collection.
 *
 * Wiring the concrete collections happens here, before anything is exported, so
 * that the query operators are usable no matter which barrel of the library was
 * imported first.
 */
bootstrapCollections();

export { GroupCollection } from '@/collections/group/group.collection';
