import { createError } from '@fulcro/errors';

import {
	type ByteCodec,
	createFixedLayout,
	type Encoding,
	type FixedLayoutType,
} from '@/src/fixedLayout';
import type { BoundedNumericType } from '@/src/numericType';
import { registerCodec } from '@/src/struct/codec';

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
 * Descriptor of a float format: its arithmetic, and how its values are stored
 * as bytes.
 *
 * @template T Type of the values this descriptor produces.
 */
export type FloatType<T> = BoundedNumericType<T, number> & FixedLayoutType<T>;

/**
 * Builds the descriptor of a float format.
 *
 * The codec a struct field of the format is stored by is registered under the
 * same descriptor, so the format has one encoding, whether the value is stored
 * alone or inside a struct.
 *
 * @param name Name of the type, as it reads in an error message.
 * @param maximum Largest finite value of the format. The smallest is its
 * negation, since a float's range is symmetric about zero.
 * @param round Rounding of a double to the nearest value of the format, ties to
 * even.
 * @param codec How a value of the format is stored as bytes.
 * @param encoding How the codec encodes one value.
 * @returns The descriptor.
 */
export const createFloatType = <T>(
	name: string,
	maximum: number,
	round: (value: number) => number,
	codec: ByteCodec<number>,
	encoding: Encoding,
): FloatType<T> => {
	const descriptor: FloatType<T> = {
		...createFixedLayout(name, codec as ByteCodec<T>, encoding),
		name,
		minimum: -maximum as T,
		maximum: maximum as T,

		from: (value: number): T => {
			// A `bigint` is refused rather than converted: turning it into a double
			// first and then into the format rounds twice, and the second rounding
			// can land on the wrong neighbour.
			if (typeof value !== 'number') {
				throw createError('FULCRO6006', {
					operation: `${name}.from`,
					received: typeof value,
				});
			}

			return round(value) as T;
		},

		is: (value: unknown): value is T => {
			return typeof value === 'number' && (Number.isNaN(value) || Object.is(round(value), value));
		},

		add: (left: T, right: T): T => round((left as number) + (right as number)) as T,

		subtract: (left: T, right: T): T => round((left as number) - (right as number)) as T,

		multiply: (left: T, right: T): T => round((left as number) * (right as number)) as T,

		divide: (left: T, right: T): T => round((left as number) / (right as number)) as T,

		remainder: (left: T, right: T): T => round((left as number) % (right as number)) as T,

		// Unlike the four above, `Math.pow` is not correctly rounded even in double
		// precision, so the result is the platform's double power rounded once into
		// the format: faithful, and not promised to be the nearest.
		power: (base: T, exponent: T): T => round((base as number) ** (exponent as number)) as T,

		// Exact in every format: only the sign bit changes.
		negate: (value: T): T => -(value as number) as T,

		increment: (value: T): T => round((value as number) + 1) as T,

		decrement: (value: T): T => round((value as number) - 1) as T,

		equals: (left: T, right: T): boolean => left === right,
		lessThan: (left: T, right: T): boolean => left < right,
		lessThanOrEqual: (left: T, right: T): boolean => left <= right,
		greaterThan: (left: T, right: T): boolean => left > right,
		greaterThanOrEqual: (left: T, right: T): boolean => left >= right,
	};

	registerCodec(descriptor, {
		...(codec as ByteCodec<unknown>),
		equals: (left, right) => descriptor.equals(left as T, right as T),
	});

	return descriptor;
};
