import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComplexNumber } from '@/complexNumber';
import { DoublePrecisionFloat } from '@/doublePrecisionFloat';

/**
 * Performance suite for `ComplexNumber`.
 *
 * Each operation is a fixed number of calls to the part type's descriptor,
 * and the suite holds each to that number: a product is four multiplications
 * and two additions or subtractions, a quotient reuses one squared norm for
 * both parts, and a real number made from a number converts its zero once for
 * the life of the type.
 */

/** Operations repeated in the volume cases. */
const VOLUME = 10_000;

const Complex = ComplexNumber(DoublePrecisionFloat);
const left = Complex.from({ real: 3, imaginary: -4 });
const right = Complex.from({ real: -7, imaginary: 2 });

afterEach(() => {
	vi.restoreAllMocks();
});

describe('ComplexNumber', () => {
	it('should multiply with four products and two sums', () => {
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');
		const add = vi.spyOn(DoublePrecisionFloat, 'add');
		const subtract = vi.spyOn(DoublePrecisionFloat, 'subtract');

		for (let index = 0; index < VOLUME; index++) Complex.multiply(left, right);

		expect(multiply).toHaveBeenCalledTimes(4 * VOLUME);
		expect(add.mock.calls.length + subtract.mock.calls.length).toBe(2 * VOLUME);
	});

	it('should divide with one squared norm and one division per part', () => {
		const divide = vi.spyOn(DoublePrecisionFloat, 'divide');
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');

		Complex.divide(left, right);

		expect(divide).toHaveBeenCalledTimes(2);
		// Two for the squared norm, four for the product by the conjugate.
		expect(multiply).toHaveBeenCalledTimes(6);
	});

	it('should convert its zero once, however many real numbers it makes', () => {
		const Fresh = ComplexNumber(DoublePrecisionFloat);
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		for (let index = 0; index < VOLUME; index++) Fresh.from(index);

		// One per value for its real part, and one zero for all of them.
		expect(from).toHaveBeenCalledTimes(VOLUME + 1);
	});

	it('should stop comparing at the first part that differs', () => {
		const equals = vi.spyOn(DoublePrecisionFloat, 'equals');

		Complex.equals(left, right);

		expect(equals).toHaveBeenCalledTimes(1);
	});
});
