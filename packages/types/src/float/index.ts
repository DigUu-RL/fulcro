import type { NumericType } from '@/numericType';

/**
 * Machinery shared by the three binary floating point types.
 *
 * A float type is fully described by one function: the rounding from a double
 * to its own format. Everything else follows from a result proved by Figueroa
 * (1995): when the wider format has at least 2p + 2 bits of precision, an
 * addition, subtraction, multiplication or division computed in the wider
 * format and then rounded to the narrower one is correctly rounded. A double
 * carries 53 bits; single precision needs 2·24 + 2 = 50 and half precision
 * 2·11 + 2 = 24. So each operation below is the double operation, rounded once.
 *
 * The remainder needs no such argument — it is always exact.
 */

/**
 * Builds the descriptor of a float format.
 *
 * @param name Name of the type, as it reads in an error message.
 * @param round Rounding of a double to the nearest value of the format, ties to
 * even.
 * @returns The descriptor.
 */
export const createFloatType = <T>(
	name: string,
	round: (value: number) => number,
): NumericType<T, number> => ({
	name,

	from: (value: number): T => {
		// A `bigint` is refused rather than converted: turning it into a double
		// first and then into the format rounds twice, and the second rounding
		// can land on the wrong neighbour.
		if (typeof value !== 'number') {
			throw new TypeError(
				`${name}.from: expected a number, received ${typeof value}.`,
			);
		}

		return round(value) as T;
	},

	is: (value: unknown): value is T =>
		typeof value === 'number' &&
		(Number.isNaN(value) || Object.is(round(value), value)),

	add: (left: T, right: T): T =>
		round((left as number) + (right as number)) as T,

	subtract: (left: T, right: T): T =>
		round((left as number) - (right as number)) as T,

	multiply: (left: T, right: T): T =>
		round((left as number) * (right as number)) as T,

	divide: (left: T, right: T): T =>
		round((left as number) / (right as number)) as T,

	remainder: (left: T, right: T): T =>
		round((left as number) % (right as number)) as T,
});
