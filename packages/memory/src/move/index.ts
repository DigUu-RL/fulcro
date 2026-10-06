import type { Owned } from '@/owned';
import {
	createOwned,
	endBorrows,
	type Ownership,
	requireOwnership,
} from '@/ownership';

/**
 * Hands the ownership of a storage on, and spends the owner it came from.
 *
 * ```ts
 * const queue = own(() => createManagedStorage(64, 0));
 * const worker = move(queue);
 *
 * borrow(worker).get(0); // fine
 * borrow(queue); // throws: queue was moved
 * ```
 *
 * The storage is not copied: the new owner owns the very same values. Every
 * borrow of the old owner ends, and the old owner refuses everything asked of
 * it from then on.
 *
 * With the transformer of this package applied, using the old owner after
 * the move is refused when the code is compiled, not only when it runs.
 *
 * @template T Type of the values.
 * @param owner The owner to move from.
 * @returns The new owner, frozen.
 * @throws {TypeError} When the value is not an owner made by `own` or `move`.
 * @throws {Error} When the owner was already moved.
 */
export const move = <T>(owner: Owned<T>): Owned<T> => {
	const state: Ownership<T> = requireOwnership<T>('move', owner);

	endBorrows(state, false);

	return createOwned(state);
};
