import { createError } from '@fulcro/errors';

import { describeValue } from '@/storage/describeValue';

/**
 * Refuses a length a storage cannot be created with.
 *
 * Checked before anything is allocated, so a length of `-1` or `1.5` is an
 * error with a code rather than whatever the backing array or buffer would make
 * of it.
 *
 * @param operation Operation being performed, for the error message.
 * @param length Length handed in.
 * @throws {RangeError} When the length is not a non-negative safe integer.
 */
export const requireLength = (operation: string, length: number): void => {
	if (!Number.isSafeInteger(length) || length < 0) {
		throw createError('FULCRO7001', {
			operation,
			received: typeof length === 'number' ? length : describeValue(length),
		});
	}
};
