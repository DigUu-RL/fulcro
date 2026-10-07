import { describe, expect, expectTypeOf, it } from 'vitest';

import { BigInteger } from '@/bigInteger';
import {
	type ComplexNumber,
	ComplexNumber as ComplexNumberOf,
} from '@/complexNumber';
import { Decimal } from '@/decimal';
import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { Fraction } from '@/fraction';
import type { Layout } from '@/layout';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { struct } from '@/struct';

/**
 * Behaviour suite for `ComplexNumber`.
 *
 * The value, the arithmetic — each part through the part type's descriptor —
 * and the layout a struct stores it with.
 */

/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with and the details it was made from, which `toThrow` compares as
 * well.
 *
 * @param error The expected error, its message starting with its code.
 * @param details The details the error is expected to carry.
 * @returns The same error, carrying that code and those details.
 */
const coded = <T extends Error>(
	error: T,
	details: Readonly<Record<string, unknown>>,
): T =>
	Object.assign(error, {
		code: error.message.slice(0, 'FULCRO0000'.length),
		details,
	});

const Complex = ComplexNumberOf(DoublePrecisionFloat);
const i = Complex.from({ real: 0, imaginary: 1 });
const value = Complex.from({ real: 3, imaginary: 4 });

describe('ComplexNumber', () => {
	describe('values', () => {
		it('should hold its two parts in a frozen object', () => {
			expect(value).toEqual({ real: 3, imaginary: 4 });
			expect(Object.keys(value)).toEqual(['real', 'imaginary']);
			expect(Object.isFrozen(value)).toBe(true);
		});

		it('should make a real number from a number alone', () => {
			expect(Complex.from(2)).toEqual({ real: 2, imaginary: 0 });
		});

		it('should take a Decimal as a real number, not as parts', () => {
			const Exact = ComplexNumberOf(Decimal);
			const made = Exact.from(Decimal.from('0.1'));

			expect(String(made.real)).toBe('0.1');
			expect(String(made.imaginary)).toBe('0');
		});

		it('should name itself after its part type', () => {
			expect(Complex.name).toBe('ComplexNumber<DoublePrecisionFloat>');
		});

		it('should infer the part type', () => {
			expectTypeOf(value).toEqualTypeOf<ComplexNumber<DoublePrecisionFloat>>();
			expectTypeOf(value.real).toEqualTypeOf<DoublePrecisionFloat>();
		});

		it('should recognise its own values and nothing else', () => {
			expect(Complex.is(value)).toBe(true);
			expect(Complex.is({ real: 3, imaginary: 4 })).toBe(false);
			expect(Complex.is(Object.freeze({ real: 3 }))).toBe(false);
			expect(
				Complex.is(Object.freeze({ real: 3, imaginary: 4, other: 0 })),
			).toBe(false);
			expect(
				ComplexNumberOf(SinglePrecisionFloat).is(
					Complex.from({ real: 0.1, imaginary: 0 }),
				),
			).toBe(false);
		});
	});

	describe('arithmetic', () => {
		it('should add, subtract and negate part by part', () => {
			expect(Complex.add(value, i)).toEqual({ real: 3, imaginary: 5 });
			expect(Complex.subtract(value, i)).toEqual({ real: 3, imaginary: 3 });
			expect(Complex.negate(value)).toEqual({ real: -3, imaginary: -4 });
		});

		it('should square i into minus one', () => {
			expect(Complex.multiply(i, i)).toEqual({ real: -1, imaginary: 0 });
		});

		it('should multiply as (ac − bd) + (ad + bc)i', () => {
			expect(
				Complex.multiply(value, Complex.from({ real: 1, imaginary: 2 })),
			).toEqual({ real: -5, imaginary: 10 });
		});

		it('should divide by multiplying by the conjugate over the squared norm', () => {
			expect(
				Complex.divide(Complex.from({ real: -5, imaginary: 10 }), value),
			).toEqual({ real: 1, imaginary: 2 });
			expect(
				Complex.divide(
					Complex.from({ real: 1, imaginary: 1 }),
					Complex.from(2),
				),
			).toEqual({
				real: 0.5,
				imaginary: 0.5,
			});
		});

		it('should divide by zero as the part type does', () => {
			// The dividend times the conjugate of zero is zero, over a squared norm
			// of zero: 0 / 0 in each part, which a float calls NaN.
			const quotient = Complex.divide(value, Complex.from(0));

			expect(quotient.real).toBeNaN();
			expect(quotient.imaginary).toBeNaN();
			expect(() =>
				ComplexNumberOf(SignedInteger(32)).divide(
					ComplexNumberOf(SignedInteger(32)).from(1),
					ComplexNumberOf(SignedInteger(32)).from(0),
				),
			).toThrow(RangeError);
		});

		it('should conjugate and scale', () => {
			expect(Complex.conjugate(value)).toEqual({ real: 3, imaginary: -4 });
			expect(Complex.scale(value, DoublePrecisionFloat.from(2))).toEqual({
				real: 6,
				imaginary: 8,
			});
		});

		it('should be exact over fractions', () => {
			const Ratio = Fraction(SignedInteger(32));
			const Exact = ComplexNumberOf(Ratio);
			const third = Exact.from({
				real: { numerator: 1, denominator: 3 } as never,
				imaginary: 0 as never,
			});

			expect(Exact.add(third, third).real).toEqual({
				numerator: 2,
				denominator: 3,
			});
		});

		it('should compare part by part', () => {
			expect(
				Complex.equals(value, Complex.from({ real: 3, imaginary: 4 })),
			).toBe(true);
			expect(Complex.equals(value, i)).toBe(false);
		});
	});

	describe('layout', () => {
		it('should declare the real part then the imaginary one', () => {
			expectTypeOf<
				ComplexNumber<SinglePrecisionFloat>['~layout']
			>().toEqualTypeOf<{ readonly size: 8; readonly alignment: 4 }>();
			expectTypeOf<ComplexNumber<BigInteger>>().not.toMatchTypeOf<
				Layout<number, number>
			>();
		});

		it('should be stored by a struct as its two parts', () => {
			const Signal = struct('Signal', { sample: Complex });
			const view = new DataView(new ArrayBuffer(Signal.layout.size));
			const written = Signal.from({ sample: { real: 3, imaginary: 4 } });

			Signal.write(view, 0, written);

			expect(Signal.layout.size).toBe(16);
			expect(view.getFloat64(8, true)).toBe(4);
			expect(Complex.is(Signal.read(view, 0).sample)).toBe(true);
			expect(Signal.equals(Signal.read(view, 0), written)).toBe(true);
		});
	});

	describe('refusals', () => {
		it('should refuse a part type without arithmetic', () => {
			expect(() => ComplexNumberOf({ name: 'Nothing' } as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO6033: ComplexNumber: expected a numeric type of @fulcro/types as the element type, received object.',
					),
					{ operation: 'ComplexNumber', received: 'object' },
				),
			);
		});

		it('should refuse a missing part and a part it does not have', () => {
			expect(() => Complex.from({ real: 1 } as never)).toThrow(
				coded(
					new TypeError(
						"FULCRO6021: ComplexNumber<DoublePrecisionFloat>.from: missing field 'imaginary'.",
					),
					{
						operation: 'ComplexNumber<DoublePrecisionFloat>.from',
						field: 'imaginary',
					},
				),
			);
			expect(() =>
				Complex.from({ real: 1, imaginary: 0, other: 2 } as never),
			).toThrow(
				coded(
					new TypeError(
						"FULCRO6020: ComplexNumber<DoublePrecisionFloat>.from: 'other' is not a field; the fields are real, imaginary.",
					),
					{
						operation: 'ComplexNumber<DoublePrecisionFloat>.from',
						key: 'other',
						fields: 'real, imaginary',
					},
				),
			);
		});

		it('should name the part its own type refused, keeping its code', () => {
			expect(() => Complex.from({ real: 1, imaginary: 'x' } as never)).toThrow(
				coded(
					new TypeError(
						"FULCRO6006: ComplexNumber<DoublePrecisionFloat>.from: field 'imaginary': DoublePrecisionFloat.from: expected a number, received string.",
					),
					{ operation: 'DoublePrecisionFloat.from', received: 'string' },
				),
			);
		});
	});
});
