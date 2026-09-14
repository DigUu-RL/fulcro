import {
	CollectionFactories,
	GroupFactory,
	OrderedSequenceFactory,
} from '@/@types/collections/factories';
import { Group } from '@/@types/collections/group';
import { OrderedSequence, SortCriterion } from '@/@types/collections/ordered';

/**
 * Registry holding the concrete collection factories.
 *
 * `SequenceCollection` is the base class of both `GroupCollection` and
 * `OrderedSequenceCollection`, yet it has to create instances of them in
 * `groupBy`, `orderBy` and `orderByDescending`. Importing the subclasses from
 * the base class module would create an import cycle that breaks at load time
 * ("Class extends value undefined"), so the base class depends on this registry
 * instead and the composition root (`@/collections/factories/bootstrap`) plugs
 * the concrete classes in.
 */
let registeredFactories: CollectionFactories | undefined;

/** Message used when a factory is requested before being registered. */
const MISSING_FACTORIES_MESSAGE =
	'Collection factories were not registered. Import the library through ' +
	'its public entry points (e.g. @/collections/sequence) so that the ' +
	'composition root can wire the concrete collections.';

/**
 * Registers the concrete collection factories.
 *
 * The call is idempotent: registering again simply replaces the previously
 * registered factories.
 *
 * @param factories Concrete implementations used by the base sequence.
 */
export const registerCollectionFactories = (
	factories: CollectionFactories,
): void => {
	registeredFactories = factories;
};

/**
 * Tells whether the concrete collection factories are already available.
 *
 * @returns `true` once {@link registerCollectionFactories} has been called.
 */
export const hasCollectionFactories = (): boolean =>
	registeredFactories !== undefined;

/**
 * Resolves the registered factories.
 *
 * @returns The registered factories.
 * @throws {Error} When no factory has been registered yet.
 */
const resolveFactories = (): CollectionFactories => {
	if (!registeredFactories) throw new Error(MISSING_FACTORIES_MESSAGE);
	return registeredFactories;
};

/**
 * Creates a {@link Group} through the registered {@link GroupFactory}.
 *
 * @template K Type of the key shared by the elements.
 * @template T Type of the grouped elements.
 * @param key Key shared by every element of the group.
 * @param source Elements belonging to the group.
 * @returns The created group.
 * @throws {Error} When no factory has been registered yet.
 */
export const createGroup = <K, T>(key: K, source: Iterable<T>): Group<K, T> => {
	return resolveFactories().group(key, source);
};

/**
 * Creates an {@link OrderedSequence} through the registered
 * {@link OrderedSequenceFactory}.
 *
 * @template T Type of the elements contained in the sequence.
 * @param source Sequence to be sorted.
 * @param criteria Sorting criteria applied in order of precedence.
 * @returns The created ordered sequence.
 * @throws {Error} When no factory has been registered yet.
 */
export const createOrderedSequence = <T>(
	source: Iterable<T>,
	criteria: readonly SortCriterion<T>[],
): OrderedSequence<T> => {
	return resolveFactories().ordered(source, criteria);
};
