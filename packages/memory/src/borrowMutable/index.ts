import type { MutableBorrow } from '@/mutableBorrow';
import type { Owned } from '@/owned';
import {
	borrowedSource,
	endBorrows,
	type Ownership,
	recordBorrow,
	requireOwnership,
} from '@/ownership';
import { createView } from '@/region';

/**
 * Lends the values of an owner for writing, and for nothing else at the same
 * time.
 *
 * ```ts
 * const scores = borrowMutable(owner);
 *
 * scores.set(0, 10);
 * ```
 *
 * Exclusive: taking it ends every borrow of the owner taken before, shared or
 * not, and it ends in turn when the owner is lent again or moved. Accessing a
 * borrow that has ended throws, so two pieces of code never write the same
 * values through two live borrows, and nobody reads through one while
 * another writes.
 *
 * Nothing is read or copied when it is made. Every access goes to the owned
 * storage, after one check that the borrow has not ended.
 *
 * @template T Type of the values.
 * @param owner The owner to borrow from.
 * @returns A view of all of its values, frozen.
 * @throws {TypeError} When the value is not an owner made by `own` or `move`.
 * @throws {Error} When the owner was moved.
 */
export const borrowMutable = <T>(owner: Owned<T>): MutableBorrow<T> => {
	const state: Ownership<T> = requireOwnership<T>('borrowMutable', owner);

	endBorrows(state, true);

	return recordBorrow(
		createView(borrowedSource(state), 0, state.storage.length),
	) as MutableBorrow<T>;
};
