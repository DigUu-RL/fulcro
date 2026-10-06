import { createError } from '@fulcro/errors';

import { describeValue } from '@/storage/describeValue';

/**
 * A position or a count as an error detail: the number when it is one — a
 * JavaScript caller can hand in anything — and its kind otherwise.
 *
 * @param value Value handed in.
 * @returns The detail.
 */
const reported = (value: unknown): number | string =>
	typeof value === 'number' ? value : describeValue(value);

/**
 * Refuses a part that does not fit inside what it is cut from, and says how
 * long the part is.
 *
 * Shared by `asView`, `asReadOnlyView` and `subview`, so a region that does
 * not fit fails the same way whether it is cut from a source or from a view.
 * An empty part is allowed anywhere from `0` to `available`, the end
 * included, as it is in an array.
 *
 * @param operation Operation being performed, for the error message.
 * @param start Where the part begins.
 * @param length How many values it holds; the rest when `undefined`.
 * @param available How many values there are to cut from.
 * @returns The length of the part.
 * @throws {RangeError} When the start or the length is not an integer, or the
 * part runs outside `0` to `available`.
 */
export const requirePart = (
	operation: string,
	start: number,
	length: number | undefined,
	available: number,
): number => {
	const resolved: number =
		length === undefined ? Math.max(0, available - start) : length;

	if (
		!Number.isSafeInteger(start) ||
		!Number.isSafeInteger(resolved) ||
		start < 0 ||
		resolved < 0 ||
		start + resolved > available
	) {
		throw createError('FULCRO7014', {
			operation,
			start: reported(start),
			length: reported(resolved),
			available,
		});
	}

	return resolved;
};
