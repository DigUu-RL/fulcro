import { describe, expect, expectTypeOf, it } from 'vitest';

import { BigInteger } from '@/bigInteger';
import { type Fraction, Fraction as FractionOf } from '@/fraction';
import type { Layout } from '@/layout';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { struct } from '@/struct';
import { UnsignedInteger } from '@/unsignedInteger';

/**
 * Behaviour suite for `Fraction`.
 *
 * Every fraction is in lowest terms with a positive denominator, so the suite
 * checks the normal form after each operation as well as the value; and every
 * operation of the numeric type contract, since a fraction is one.
 */

/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with, which `toThrow` compares as well.
 *
 * @param error The expected error, its message starting with its code.
 * @returns The same error, carrying that code.
 */
const coded = <T extends Error>(error: T): T =>
	Object.assign(error, { code: error.message.slice(0, 'FULCRO0000'.length) });

const Ratio = FractionOf(SignedInteger(32));

/**
 * @param numerator Numerator.
 * @param denominator Denominator.
 * @returns The fraction, reduced.
 */
const ratio = (numerator: number, denominator = 1) =>
	Ratio.from({ numerator, denominator });

describe('Fraction', () => {
	describe('values', () => {
		it('should reduce to lowest terms with a positive denominator', () => {
			expect(ratio(6, -4)).toEqual({ numerator: -3, denominator: 2 });
			expect(ratio(-6, -4)).toEqual({ numerator: 3, denominator: 2 });
			expect(ratio(0, -7)).toEqual({ numerator: 0, denominator: 1 });
		});

		it('should make a whole number from an integer', () => {
			expect(Ratio.from(4)).toEqual({ numerator: 4, denominator: 1 });
		});

		it('should hold its parts in a frozen object', () => {
			expect(Object.keys(ratio(1, 3))).toEqual(['numerator', 'denominator']);
			expect(Object.isFrozen(ratio(1, 3))).toBe(true);
		});

		it('should name itself after its integer type', () => {
			expect(Ratio.name).toBe('Fraction<SignedInteger<32>>');
		});

		it('should infer its integer type', () => {
			expectTypeOf(ratio(1, 3)).toEqualTypeOf<Fraction<SignedInteger<32>>>();
		});

		it('should recognise only fractions in normal form', () => {
			expect(Ratio.is(ratio(2, 4))).toBe(true);
			expect(Ratio.is(Object.freeze({ numerator: 2, denominator: 4 }))).toBe(
				false,
			);
			expect(Ratio.is(Object.freeze({ numerator: 1, denominator: -2 }))).toBe(
				false,
			);
			expect(Ratio.is(Object.freeze({ numerator: 1, denominator: 2 }))).toBe(
				true,
			);
			expect(Ratio.is({ numerator: 1, denominator: 2 })).toBe(false);
		});
	});

	describe('arithmetic', () => {
		it('should add and subtract over the least common denominator', () => {
			expect(Ratio.add(ratio(1, 6), ratio(1, 4))).toEqual(ratio(5, 12));
			expect(Ratio.add(ratio(1, 3), ratio(2, 3))).toEqual({
				numerator: 1,
				denominator: 1,
			});
			expect(Ratio.subtract(ratio(1, 4), ratio(1, 2))).toEqual(ratio(-1, 4));
		});

		it('should multiply and divide exactly', () => {
			expect(Ratio.multiply(ratio(2, 3), ratio(9, 4))).toEqual(ratio(3, 2));
			expect(Ratio.divide(ratio(2, 3), ratio(-4, 9))).toEqual(ratio(-3, 2));
		});

		it('should cancel across before multiplying, so the result fits where the naive product would not', () => {
			const Small = FractionOf(SignedInteger(8));
			const left = Small.from({ numerator: 100, denominator: 101 });
			const right = Small.from({ numerator: 101, denominator: 100 });

			expect(Small.multiply(left, right)).toEqual({
				numerator: 1,
				denominator: 1,
			});
		});

		it('should take the remainder with the sign of the dividend', () => {
			expect(Ratio.remainder(ratio(7, 2), ratio(1))).toEqual(ratio(1, 2));
			expect(Ratio.remainder(ratio(-7, 2), ratio(1))).toEqual(ratio(-1, 2));
			expect(Ratio.remainder(ratio(5, 6), ratio(1, 4))).toEqual(ratio(1, 12));
		});

		it('should raise to a whole power, and invert for a negative one', () => {
			expect(Ratio.power(ratio(2, 3), ratio(3))).toEqual(ratio(8, 27));
			expect(Ratio.power(ratio(2, 3), ratio(-2))).toEqual(ratio(9, 4));
			expect(Ratio.power(ratio(-2, 3), ratio(-1))).toEqual(ratio(-3, 2));
			expect(Ratio.power(ratio(5, 7), ratio(0))).toEqual(ratio(1));
		});

		it('should negate, increment and decrement in normal form', () => {
			expect(Ratio.negate(ratio(1, 3))).toEqual(ratio(-1, 3));
			expect(Ratio.increment(ratio(1, 3))).toEqual(ratio(4, 3));
			expect(Ratio.decrement(ratio(1, 3))).toEqual(ratio(-2, 3));
		});

		it('should compare as rationals, not as their parts', () => {
			expect(Ratio.equals(ratio(2, 4), ratio(1, 2))).toBe(true);
			expect(Ratio.lessThan(ratio(1, 3), ratio(1, 2))).toBe(true);
			expect(Ratio.lessThan(ratio(-1, 2), ratio(-1, 3))).toBe(true);
			expect(Ratio.lessThanOrEqual(ratio(1, 2), ratio(2, 4))).toBe(true);
			expect(Ratio.greaterThan(ratio(2, 3), ratio(3, 5))).toBe(true);
			expect(Ratio.greaterThanOrEqual(ratio(3, 5), ratio(2, 3))).toBe(false);
		});

		it('should grow without bound over BigInteger', () => {
			const Exact = FractionOf(BigInteger);
			const tiny = Exact.from({ numerator: 1, denominator: 2n ** 100n });

			expect(Exact.multiply(tiny, tiny)).toEqual({
				numerator: 1n,
				denominator: 2n ** 200n,
			});
		});

		it("should throw the integer type's error when an intermediate leaves its range", () => {
			const Small = FractionOf(SignedInteger(8));

			expect(() =>
				Small.add(
					Small.from({ numerator: 1, denominator: 127 }),
					Small.from({ numerator: 1, denominator: 126 }),
				),
			).toThrow(RangeError);
		});
	});

	describe('layout', () => {
		it('should declare the numerator then the denominator', () => {
			expectTypeOf<Fraction<SignedInteger<32>>['~layout']>().toEqualTypeOf<{
				readonly size: 8;
				readonly alignment: 4;
			}>();
			expectTypeOf<Fraction<BigInteger>>().not.toMatchTypeOf<
				Layout<number, number>
			>();
		});

		it('should be stored by a struct as its two parts', () => {
			const Scale = struct('Scale', {
				factor: FractionOf(UnsignedInteger(16)),
			});
			const view = new DataView(new ArrayBuffer(Scale.layout.size));
			const value = Scale.from({ factor: { numerator: 3, denominator: 4 } });

			Scale.write(view, 0, value);

			expect([view.getUint16(0, true), view.getUint16(2, true)]).toEqual([
				3, 4,
			]);
			expect(Scale.equals(Scale.read(view, 0), value)).toBe(true);
		});
	});

	describe('refusals', () => {
		it('should refuse a type that is not an integer type', () => {
			expect(() => FractionOf(SinglePrecisionFloat as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO6041: Fraction: expected SignedInteger(n), UnsignedInteger(n) or BigInteger as the element type, received object.',
					),
				),
			);
		});

		it('should refuse a zero denominator', () => {
			expect(() => ratio(1, 0)).toThrow(
				coded(
					new RangeError(
						'FULCRO6001: Fraction<SignedInteger<32>>.from: division by zero.',
					),
				),
			);
		});

		it.each(['divide', 'remainder'] as const)(
			'should refuse to %s by zero',
			(operation) => {
				expect(() => Ratio[operation](ratio(1), ratio(0))).toThrow(
					coded(
						new RangeError(
							`FULCRO6001: Fraction<SignedInteger<32>>.${operation}: division by zero.`,
						),
					),
				);
			},
		);

		it('should refuse a power of zero with a negative exponent', () => {
			expect(() => Ratio.power(ratio(0), ratio(-1))).toThrow(
				coded(
					new RangeError(
						'FULCRO6001: Fraction<SignedInteger<32>>.power: division by zero.',
					),
				),
			);
		});

		it('should refuse an exponent that is not whole', () => {
			expect(() => Ratio.power(ratio(4), ratio(1, 2))).toThrow(
				coded(
					new RangeError(
						'FULCRO6042: Fraction<SignedInteger<32>>.power: expected a whole exponent, received 1/2.',
					),
				),
			);
		});

		it('should refuse a numerator that is not an integer, keeping its code', () => {
			expect(() => ratio(0.5, 2)).toThrow(RangeError);
		});
	});
});
