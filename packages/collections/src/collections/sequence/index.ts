import { bootstrapCollections } from '@/collections/factories/bootstrap';

/**
 * Public entry point of the base sequence collection.
 *
 * Wiring the concrete collections happens here, before anything is exported, so
 * that `groupBy`, `orderBy` and `orderByDescending` are usable no matter which
 * barrel of the library was imported first.
 */
bootstrapCollections();

export { SequenceCollection } from '@/collections/sequence/sequence.collection';
