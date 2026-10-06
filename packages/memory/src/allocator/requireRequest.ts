import { createError } from '@fulcro/errors';

import { describeValue } from '@/storage/describeValue';

/**
 * Refuses a byte count an allocator cannot be created with or asked for.
 *
 * @param operation Operation being performed, for the error message.
 * @param size Byte count handed in.
 * @throws {RangeError} When it is not a non-negative safe integer.
 */
export const requireSize = (operation: string, size: number): void => {
	if (!Number.isSafeInteger(size) || size < 0) {
		throw createError('FULCRO7005', {
			operation,
			received: typeof size === 'number' ? size : describeValue(size),
		});
	}
};

/**
 * Refuses an alignment no offset can honour.
 *
 * A power of two because every layout's alignment is one: an alignment of
 * three describes no address any type needs, and is far likelier a size
 * passed in the wrong position.
 *
 * @param operation Operation being performed, for the error message.
 * @param alignment Alignment handed in.
 * @throws {RangeError} When it is not a positive power of two.
 */
export const requireAlignment = (
	operation: string,
	alignment: number,
): void => {
	if (
		!Number.isSafeInteger(alignment) ||
		alignment <= 0 ||
		2 ** Math.round(Math.log2(alignment)) !== alignment
	) {
		throw createError('FULCRO7006', {
			operation,
			received:
				typeof alignment === 'number' ? alignment : describeValue(alignment),
		});
	}
};

/**
 * Refuses a request before anything is reserved for it.
 *
 * @param operation Operation being performed, for the error message.
 * @param size Byte count asked for.
 * @param alignment Alignment asked for.
 * @throws {RangeError} When either is invalid.
 */
export const requireRequest = (
	operation: string,
	size: number,
	alignment: number,
): void => {
	requireSize(operation, size);
	requireAlignment(operation, alignment);
};
