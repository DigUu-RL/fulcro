import { describe, expect, expectTypeOf, it } from 'vitest';

import type { IntegerType } from '@/integer';
import { UnsignedInteger } from '@/unsignedInteger';

/**
 * Behaviour suite for `UnsignedInteger`.
 *
 * The same boundaries as the signed suite, with the one an unsigned type adds:
 * zero is the minimum, so the subtraction everyone writes without thinking —
 * `count - 1` — is the one that overflows.
 */

/** Range of each width, computed independently of the implementation. */
const RANGES = [
	{ width: 8, maximum: 255n },
	{ width: 16, maximum: 65_535n },
	{ width: 32, maximum: 4_294_967_295n },
	{ width: 64, maximum: 2n ** 64n - 1n },
	{ width: 128, maximum: 2n ** 128n - 1n },
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

describe('UnsignedInteger', () => {
	describe.each(RANGES)('at $width bits', ({ width, maximum }) => {
		const type = UnsignedInteger(width) as IntegerType<number | bigint>;

		it('should report a range starting at zero', () => {
			expect(type.minimum).toBe(carried(width, 0n));
			expect(type.maximum).toBe(carried(width, maximum));
			expect(type.signed).toBe(false);
			expect(type.name).toBe(`UnsignedInteger<${width}>`);
		});

		it('should accept both ends and refuse one past either', () => {
			expect(type.from(0)).toBe(carried(width, 0n));
			expect(type.from(maximum)).toBe(carried(width, maximum));
			expect(() => type.from(-1)).toThrow(
				`UnsignedInteger<${width}>.from: -1 is outside [0, ${maximum}].`,
			);
			expect(() => type.from(maximum + 1n)).toThrow(RangeError);
		});

		it('should wrap a negative value to the top of the range', () => {
			expect(type.wrap(-1)).toBe(carried(width, maximum));
			expect(type.wrap(maximum + 1n)).toBe(carried(width, 0n));

			const modulus: bigint = 2n ** BigInt(width);

			for (const value of [-modulus * 7n + 3n, modulus * 11n + 5n]) {
				expect(type.wrap(value)).toBe(
					carried(width, BigInt.asUintN(width, value)),
				);
			}
		});

		it('should refuse a subtraction below zero', () => {
			expect(() => type.subtract(type.from(0), type.from(1))).toThrow(
				`UnsignedInteger<${width}>.subtract: -1${width >= 64 ? 'n' : ''} is outside [0, ${maximum}].`,
			);
		});

		it('should refuse an addition past the maximum', () => {
			expect(() => type.add(type.maximum, type.from(1))).toThrow(RangeError);
		});

		it('should divide, and refuse a zero divisor', () => {
			expect(type.divide(type.from(9), type.from(4))).toBe(carried(width, 2n));
			expect(type.remainder(type.from(9), type.from(4))).toBe(
				carried(width, 1n),
			);
			expect(() => type.divide(type.from(9), type.from(0))).toThrow(RangeError);
		});

		it('should multiply up to the maximum and refuse past it', () => {
			expect(
				type.multiply(type.from(carried(width, maximum / 3n)), type.from(3)),
			).toBe(carried(width, maximum));
			expect(() => type.multiply(type.maximum, type.from(2))).toThrow(
				RangeError,
			);
		});

		it('should recognise its own values and nothing else', () => {
			expect(type.is(type.maximum)).toBe(true);
			expect(type.is(width >= 64 ? -1n : -1)).toBe(false);
		});
	});

	describe.each(RANGES)(
		'the operations behind the operators, at $width bits',
		({ width, maximum }) => {
			const type = UnsignedInteger(width) as IntegerType<number | bigint>;
			const of = (value: bigint) => type.from(carried(width, value));

			it('should negate only zero', () => {
				expect(type.negate(of(0n))).toBe(carried(width, 0n));
				expect(() => type.negate(of(1n))).toThrow(
					`UnsignedInteger<${width}>.negate`,
				);
			});

			it('should refuse to step below zero', () => {
				expect(() => type.decrement(of(0n))).toThrow(RangeError);
				expect(type.increment(of(0n))).toBe(carried(width, 1n));
			});

			it('should complement and shift over the unsigned bits', () => {
				expect(type.bitwiseNot(of(0n))).toBe(carried(width, maximum));
				expect(type.shiftLeft(type.maximum, of(1n))).toBe(
					carried(width, maximum - 1n),
				);
				expect(type.shiftRight(type.maximum, of(BigInt(width - 1)))).toBe(
					carried(width, 1n),
				);
				expect(type.shiftRightLogical(type.maximum, of(1n))).toBe(
					type.shiftRight(type.maximum, of(1n)),
				);
			});

			it('should raise to a power up to the maximum and refuse past it', () => {
				expect(type.power(of(2n), of(BigInt(width - 1)))).toBe(
					carried(width, 2n ** BigInt(width - 1)),
				);
				expect(() => type.power(of(2n), of(BigInt(width)))).toThrow(RangeError);
			});
		},
	);

	it('should mask a number of any size exactly', () => {
		// Past 2^53, but still exact: 2^60 + 2^9 is a double.
		expect(UnsignedInteger(32).wrap(2 ** 60 + 2 ** 9)).toBe(2 ** 9);
		expect(UnsignedInteger(16).wrap(-(2 ** 40) - 1)).toBe(65_535);
	});

	it('should return one descriptor per width', () => {
		expect(UnsignedInteger(8)).toBe(UnsignedInteger(8));
	});

	it('should be told apart from the signed type of the same width', () => {
		expectTypeOf(UnsignedInteger(16).from(1)).toEqualTypeOf<
			UnsignedInteger<16>
		>();
		expectTypeOf<UnsignedInteger<16>>().not.toMatchTypeOf<
			import('@/signedInteger').SignedInteger<16>
		>();
		expectTypeOf(UnsignedInteger(64).from(1)).toMatchTypeOf<bigint>();
	});
});
