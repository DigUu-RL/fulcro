/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * It exposes the query contracts, the delegate types the operators take, and
 * the one class a consumer ever builds a sequence from — and guarantees that
 * the composition root ran.
 *
 * Two things are deliberately absent.
 *
 * `GroupCollection` and `OrderedSequenceCollection` are not exported. Both have
 * a private constructor, and their only public member is the factory hook the
 * composition root registers, so there is nothing a consumer could do with
 * either. Groups come out of {@link Sequence.groupBy} and ordered sequences out
 * of {@link Sequence.orderBy}, described by the `Group` and `OrderedSequence`
 * interfaces below.
 *
 * Neither is the factory registry contract — `CollectionFactories` and the two
 * factory types. It exists so that the base sequence can create its own
 * subclasses without importing them, which is what keeps the module graph
 * acyclic; it is wiring, not API. Publishing it would turn every change to that
 * wiring into a breaking change.
 */
export * from '@/@types';
export * from '@/@types/collections/group';
export * from '@/@types/collections/ordered';
export * from '@/@types/collections/sequence';
export { SequenceCollection } from '@/collections/sequence';
