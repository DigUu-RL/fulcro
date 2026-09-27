import { afterEach, describe, expect, it, vi } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { Quaternion } from '@/quaternion';

/**
 * Performance suite for `Quaternion`.
 *
 * Hamilton's product is sixteen multiplications and twelve additions or
 * subtractions, and a quotient is one squared norm — four multiplications and
 * three additions — one product by the conjugate, and four divisions. The
 * suite holds each operation to exactly that many calls to the component
 * type's descriptor.
 */

/** Operations repeated in the volume cases. */
const VOLUME = 10_000;

const Rotation = Quaternion(DoublePrecisionFloat);
const left = Rotation.from({ w: 1, x: -2, y: 3, z: -4 });
const right = Rotation.from({ w: -5, x: 6, y: -7, z: 8 });

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Quaternion', () => {
	it('should multiply with sixteen products and twelve sums', () => {
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');
		const add = vi.spyOn(DoublePrecisionFloat, 'add');
		const subtract = vi.spyOn(DoublePrecisionFloat, 'subtract');

		for (let index = 0; index < VOLUME; index++) Rotation.multiply(left, right);

		expect(multiply).toHaveBeenCalledTimes(16 * VOLUME);
		expect(add.mock.calls.length + subtract.mock.calls.length).toBe(
			12 * VOLUME,
		);
	});

	it('should divide with one squared norm, one product and four divisions', () => {
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');
		const divide = vi.spyOn(DoublePrecisionFloat, 'divide');
		const negate = vi.spyOn(DoublePrecisionFloat, 'negate');

		Rotation.divide(left, right);

		expect(multiply).toHaveBeenCalledTimes(4 + 16);
		expect(divide).toHaveBeenCalledTimes(4);
		// The conjugate negates the three imaginary components, nothing else.
		expect(negate).toHaveBeenCalledTimes(3);
	});

	it('should convert its zero once, however many real numbers it makes', () => {
		const Fresh = Quaternion(DoublePrecisionFloat);
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		for (let index = 0; index < VOLUME; index++) Fresh.from(index);

		expect(from).toHaveBeenCalledTimes(VOLUME + 1);
	});
});
