import type { NumericType } from '@/numericType';

/**
 * An integer of any size.
 *
 * The name of the concept, over the primitive that already implements it:
 * `bigint` is exact at every magnitude, so a brand would add a check with
 * nothing left to check. It is also the one numeric type here with no fixed
 * layout — its size is the size of its value — which is why
 * `sizeOf<BigInteger>()` is a type error.
 */
export type BigInteger = bigint;

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
 * Nothing overflows, so the arithmetic throws only on a zero divisor.
 */
export const BigInteger: NumericType<BigInteger, number | bigint | string> = {
	name: 'BigInteger',

	from: (value: number | bigint | string): BigInteger => {
		if (typeof value === 'bigint') return value;

		if (typeof value === 'number') {
			if (!Number.isInteger(value)) {
				throw new RangeError(
					`BigInteger.from: expected an integer, received ${value}.`,
				);
			}

			return BigInt(value);
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

			return BigInt(value);
		}

		throw new TypeError(
			`BigInteger.from: expected a number, a bigint or a string, received ${typeof value}.`,
		);
	},

	is: (value: unknown): value is BigInteger => typeof value === 'bigint',

	add: (left: BigInteger, right: BigInteger): BigInteger => left + right,

	subtract: (left: BigInteger, right: BigInteger): BigInteger => left - right,

	multiply: (left: BigInteger, right: BigInteger): BigInteger => left * right,

	divide: (left: BigInteger, right: BigInteger): BigInteger => {
		requireDivisor('divide', right);

		return left / right;
	},

	remainder: (left: BigInteger, right: BigInteger): BigInteger => {
		requireDivisor('remainder', right);

		return left % right;
	},
};
