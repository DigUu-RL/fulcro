import { describe, expect, expectTypeOf, it } from 'vitest';

import type { IntegerType } from '@/integer';
import { SignedInteger } from '@/signedInteger';

/**
 * Behaviour suite for `SignedInteger`.
 *
 * The boundaries are the specification: every width is exercised at its
 * minimum, its maximum and one past each, because an off-by-one in a range is
 * exactly the defect that passes every test written with small numbers.
 */

/** Range of each width, computed independently of the implementation. */
const RANGES = [
	{ width: 8, minimum: -128n, maximum: 127n },
	{ width: 16, minimum: -32_768n, maximum: 32_767n },
	{ width: 32, minimum: -2_147_483_648n, maximum: 2_147_483_647n },
	{ width: 64, minimum: -(2n ** 63n), maximum: 2n ** 63n - 1n },
	{ width: 128, minimum: -(2n ** 127n), maximum: 2n ** 127n - 1n },
] as const;

/**
 * Converts an exact integer into the primitive a width is carried by.
 *
 * @param width Width, in bits.
 * @param value Exact value.
 * @returns A `number` up to 32 bits, a `bigint` from 64.
 */
const carried = (width: number, value: bigint): number | bigint =>
	width >= 64 ? value : Number(value);

describe('SignedInteger', () => {
	describe.each(RANGES)('at $width bits', ({ width, minimum, maximum }) => {
		const type = SignedInteger(width) as IntegerType<number | bigint>;

		it('should report its range', () => {
			expect(type.minimum).toBe(carried(width, minimum));
			expect(type.maximum).toBe(carried(width, maximum));
			expect(type.width).toBe(width);
			expect(type.signed).toBe(true);
			expect(type.name).toBe(`SignedInteger<${width}>`);
		});

		it('should accept both ends of the range', () => {
			expect(type.from(carried(width, minimum))).toBe(carried(width, minimum));
			expect(type.from(carried(width, maximum))).toBe(carried(width, maximum));
		});

		it('should refuse one past either end, naming the range', () => {
			expect(() => type.from(maximum + 1n)).toThrow(RangeError);
			expect(() => type.from(minimum - 1n)).toThrow(RangeError);
			expect(() => type.from(maximum + 1n)).toThrow(
				`SignedInteger<${width}>.from: ${maximum + 1n}n is outside [${minimum}, ${maximum}].`,
			);
		});

		it('should accept a number and a bigint alike', () => {
			expect(type.from(-5)).toBe(carried(width, -5n));
			expect(type.from(-5n)).toBe(carried(width, -5n));
		});

		it('should refuse a fraction, NaN and the infinities', () => {
			for (const value of [1.5, Number.NaN, Infinity, -Infinity]) {
				expect(() => type.from(value)).toThrow(RangeError);
			}

			expect(() => type.from(1.5)).toThrow('expected an integer, received 1.5');
		});

		it('should refuse a value that is not numeric', () => {
			expect(() => type.from('1' as unknown as number)).toThrow(TypeError);
		});

		it('should wrap modulo 2^width, whatever the magnitude', () => {
			const modulus: bigint = 2n ** BigInt(width);

			for (const value of [
				maximum + 1n,
				minimum - 1n,
				modulus * 3n + 7n,
				-modulus * 5n - 9n,
			]) {
				expect(type.wrap(value)).toBe(
					carried(width, BigInt.asIntN(width, value)),
				);
			}

			expect(type.wrap(carried(width, maximum))).toBe(carried(width, maximum));
		});

		it('should add and subtract up to the boundary and refuse past it', () => {
			const one = type.from(1);

			expect(type.add(type.from(carried(width, maximum - 1n)), one)).toBe(
				type.maximum,
			);
			expect(type.subtract(type.from(carried(width, minimum + 1n)), one)).toBe(
				type.minimum,
			);
			expect(() => type.add(type.maximum, one)).toThrow(
				`SignedInteger<${width}>.add`,
			);
			expect(() => type.subtract(type.minimum, one)).toThrow(RangeError);
		});

		it('should multiply exactly and refuse an overflowing product', () => {
			expect(type.multiply(type.from(-7), type.from(11))).toBe(
				carried(width, -77n),
			);
			expect(() => type.multiply(type.maximum, type.from(2))).toThrow(
				RangeError,
			);
			expect(() => type.multiply(type.minimum, type.from(-1))).toThrow(
				RangeError,
			);
		});

		it('should divide truncating towards zero', () => {
			expect(type.divide(type.from(7), type.from(2))).toBe(carried(width, 3n));
			expect(type.divide(type.from(-7), type.from(2))).toBe(
				carried(width, -3n),
			);
			expect(type.divide(type.from(7), type.from(-2))).toBe(
				carried(width, -3n),
			);
		});

		it('should refuse the one quotient out of range, minimum by -1', () => {
			expect(() => type.divide(type.minimum, type.from(-1))).toThrow(
				RangeError,
			);
		});

		it('should take the sign of the dividend in the remainder', () => {
			expect(type.remainder(type.from(-7), type.from(2))).toBe(
				carried(width, -1n),
			);
			expect(type.remainder(type.from(7), type.from(-2))).toBe(
				carried(width, 1n),
			);
		});

		it('should refuse a zero divisor, naming the operation', () => {
			expect(() => type.divide(type.from(1), type.from(0))).toThrow(
				`SignedInteger<${width}>.divide: division by zero.`,
			);
			expect(() => type.remainder(type.from(1), type.from(0))).toThrow(
				`SignedInteger<${width}>.remainder: division by zero.`,
			);
		});

		it('should recognise its own values and nothing else', () => {
			expect(type.is(type.maximum)).toBe(true);
			expect(type.is(carried(width, maximum + 1n))).toBe(false);
			expect(type.is(width >= 64 ? 1 : 1n)).toBe(false);
			expect(type.is('1')).toBe(false);
		});
	});

	describe('carried by a number', () => {
		const Int32 = SignedInteger(32);

		it('should normalise -0 to 0, since an integer has one zero', () => {
			expect(Object.is(Int32.from(-0), 0)).toBe(true);
			expect(Object.is(Int32.multiply(Int32.from(-3), Int32.from(0)), 0)).toBe(
				true,
			);
			expect(Object.is(Int32.remainder(Int32.from(-4), Int32.from(2)), 0)).toBe(
				true,
			);
			expect(Object.is(Int32.wrap(-(2 ** 32)), 0)).toBe(true);
		});

		it('should wrap a number beyond 2^53 exactly', () => {
			expect(Int32.wrap(2 ** 60 + 2 ** 31)).toBe(-(2 ** 31));
		});

		it('should detect an overflowing product beyond 2^53', () => {
			// 2^31 - 1 squared is past 2^61; the rounded double is out of range
			// just as the exact product is.
			expect(() => Int32.multiply(Int32.maximum, Int32.maximum)).toThrow(
				RangeError,
			);
		});
	});

	it('should return one descriptor per width', () => {
		expect(SignedInteger(32)).toBe(SignedInteger(32));
		expect(SignedInteger(32)).not.toBe(SignedInteger(16));
	});

	it('should refuse a width it does not define', () => {
		expect(() => SignedInteger(24 as 32)).toThrow(
			'SignedInteger: expected a width of 8, 16, 32, 64, 128 bits, received 24.',
		);
	});

	it('should infer a number up to 32 bits and a bigint from 64', () => {
		expectTypeOf(SignedInteger(32).from(1)).toEqualTypeOf<SignedInteger<32>>();
		expectTypeOf(SignedInteger(32).from(1)).toMatchTypeOf<number>();
		expectTypeOf(SignedInteger(64).from(1)).toMatchTypeOf<bigint>();
		expectTypeOf(SignedInteger(128).maximum).toEqualTypeOf<
			SignedInteger<128>
		>();
	});

	it('should keep the widths apart at the type level', () => {
		expectTypeOf<SignedInteger<8>>().not.toMatchTypeOf<SignedInteger<32>>();
		expectTypeOf<number>().not.toMatchTypeOf<SignedInteger<32>>();
	});
});
