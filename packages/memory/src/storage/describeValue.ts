/**
 * Describes a value handed in as a number, for an error message: the number
 * itself when it is one, and its kind otherwise.
 *
 * @param value Value being reported.
 * @returns Its description.
 */
export const describeValue = (value: unknown): string => {
	if (typeof value === 'number') return String(value);

	return value === null ? 'null' : typeof value;
};
