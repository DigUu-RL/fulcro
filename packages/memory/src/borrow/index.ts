import type { Borrowed } from '@/borrowed';
import type { Owned } from '@/owned';
import {
	borrowedSource,
	endBorrows,
	type Ownership,
	recordBorrow,
	requireOwnership,
} from '@/ownership';
import { createReadOnlyView } from '@/region';

/**
 * Lends the values of an owner for reading.
 *
 * ```ts
 * const total = (values: ReadOnlyView<number>): number => {
 * 	let sum = 0;
 *
 * 	for (let index = 0; index < values.length; index++) sum += values.get(index);
 *
 * 	return sum;
 * };
 *
 * total(borrow(scores));
 * ```
 *
 * Shared: any number of these can be read at once, and taking one ends no
 * other shared borrow. It does end a borrow lent for writing, which cannot
 * share — reading through that one throws from then on.
 *
 * Nothing is read or copied when it is made. Every read goes to the owned
 * storage, after one check that the borrow has not ended.
 *
 * @template T Type of the values.
 * @param owner The owner to borrow from.
 * @returns A read-only view of all of its values, frozen.
 * @throws {TypeError} When the value is not an owner made by `own` or `move`.
 * @throws {Error} When the owner was moved.
 */
export const borrow = <T>(owner: Owned<T>): Borrowed<T> => {
	const state: Ownership<T> = requireOwnership<T>('borrow', owner);

	if (state.exclusive) endBorrows(state, false);

	return recordBorrow(
		createReadOnlyView(borrowedSource(state), 0, state.storage.length),
	) as Borrowed<T>;
};
