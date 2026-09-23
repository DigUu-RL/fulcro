import type { Branded } from '@/brand';
import type { NumericType } from '@/numericType';

/**
 * An integer of any size.
 *
 * Carried by a `bigint`, which is exact at every magnitude, and branded like
 * every other numeric type here: a `BigInteger` is a `bigint` that went through
 * {@link BigInteger.from}, not any `bigint` at all. That is what lets the
 * operators be rewritten for this type and left alone on every other `bigint`
 * of a program.
 *
 * It is also the one numeric type here with no fixed layout — its size is the
 * size of its value — which is why `sizeOf<BigInteger>()` is a type error.
 */
export type BigInteger = Branded<bigint, 'BigInteger'>;

/** Integer literal accepted by {@link BigInteger.from}: decimal digits only. */
const INTEGER_LITERAL = /^[+-]?\d+$/;

/**
 * Refuses a zero divisor with the operation named.
 *
 * @param operation Operation being performed.
 * @param divisor Divisor it was handed.
 */
const requireDivisor = (operation: string, divisor: bigint): void => {
	if (divisor === 0n) {
		throw new RangeError(`BigInteger.${operation}: division by zero.`);
	}
};

/**
 * The descriptor of {@link BigInteger}.
 *
 * ```ts
 * BigInteger.from('123456789012345678901234567890'); // 123456789012345678901234567890n
 * BigInteger.from(1.5); // RangeError: expected an integer
 * ```
 *
 * Nothing overflows, so the arithmetic throws only on a zero divisor and on a
 * negative exponent.
 */
export const BigInteger: NumericType<BigInteger, number | bigint | string> = {
	name: 'BigInteger',

	from: (value: number | bigint | string): BigInteger => {
		if (typeof value === 'bigint') return value as BigInteger;

		if (typeof value === 'number') {
			if (!Number.isInteger(value)) {
				throw new RangeError(
					`BigInteger.from: expected an integer, received ${value}.`,
				);
			}

			return BigInt(value) as BigInteger;
		}

		if (typeof value === 'string') {
			// `BigInt` alone would also take `0x1f`, `0b101` and surrounding
			// whitespace. A decimal type accepting a hexadecimal string is a
			// surprise nobody reading `from('0x10')` expects to be 16.
			if (!INTEGER_LITERAL.test(value)) {
				throw new SyntaxError(
					`BigInteger.from: expected decimal digits with an optional sign, received ${JSON.stringify(value)}.`,
				);
			}

			return BigInt(value) as BigInteger;
		}

		throw new TypeError(
			`BigInteger.from: expected a number, a bigint or a string, received ${typeof value}.`,
		);
	},

	is: (value: unknown): value is BigInteger => typeof value === 'bigint',

	add: (left: BigInteger, right: BigInteger): BigInteger =>
		(left + right) as BigInteger,

	subtract: (left: BigInteger, right: BigInteger): BigInteger =>
		(left - right) as BigInteger,

	multiply: (left: BigInteger, right: BigInteger): BigInteger =>
		(left * right) as BigInteger,

	divide: (left: BigInteger, right: BigInteger): BigInteger => {
		requireDivisor('divide', right);

		return (left / right) as BigInteger;
	},

	remainder: (left: BigInteger, right: BigInteger): BigInteger => {
		requireDivisor('remainder', right);

		return (left % right) as BigInteger;
	},

	power: (base: BigInteger, exponent: BigInteger): BigInteger => {
		if (exponent < 0n) {
			throw new RangeError(
				`BigInteger.power: expected an exponent of zero or more, received ${exponent}n.`,
			);
		}

		return (base ** exponent) as BigInteger;
	},

	negate: (value: BigInteger): BigInteger => -value as BigInteger,

	increment: (value: BigInteger): BigInteger => (value + 1n) as BigInteger,

	decrement: (value: BigInteger): BigInteger => (value - 1n) as BigInteger,

	equals: (left: BigInteger, right: BigInteger): boolean => left === right,
	lessThan: (left: BigInteger, right: BigInteger): boolean => left < right,
	lessThanOrEqual: (left: BigInteger, right: BigInteger): boolean =>
		left <= right,
	greaterThan: (left: BigInteger, right: BigInteger): boolean => left > right,
	greaterThanOrEqual: (left: BigInteger, right: BigInteger): boolean =>
		left >= right,
};
