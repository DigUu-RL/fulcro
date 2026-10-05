import { createError } from '@fulcro/errors';

import { describeValue } from '@/storage/describeValue';

/**
 * Refuses an index outside a storage, before anything is read or written.
 *
 * Shared by every strategy, so the same index fails the same way whichever
 * one holds the values: an array would answer `undefined` past its end, and a
 * buffer would read the bytes of a neighbour.
 *
 * @param operation Operation being performed, for the error message.
 * @param index Index handed in.
 * @param length Length of the storage.
 * @throws {RangeError} When the index is not an integer from `0` to
 * `length - 1`.
 */
export const requireIndex = (
	operation: string,
	index: number,
	length: number,
): void => {
	if (!Number.isInteger(index) || index < 0 || index >= length) {
		throw createError('FULCRO7002', operation, describeValue(index), length);
	}
};
