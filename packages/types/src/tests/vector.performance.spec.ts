import { afterEach, describe, expect, it, vi } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { Vector } from '@/vector';

/**
 * Performance suite for `Vector`.
 *
 * What a vector adds to a matrix is its flat `from` and the dot product; both
 * are counted in calls to the element type's descriptor. A dot product of N
 * elements is N multiplications and N − 1 additions, with no zero converted to
 * start it.
 */

/** Elements of the vectors measured. */
const LENGTH = 10_000;

/**
 * Elements that are all different and not in order.
 *
 * @returns The elements.
 */
const scattered = (): number[] =>
	Array.from(
		{ length: LENGTH },
		(_item, index) => ((index * 7919) % 1009) - 504,
	);

const Long = Vector(DoublePrecisionFloat, LENGTH, 1);
const long = Long.from(scattered());

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Vector', () => {
	it('should take a dot product with N products and N − 1 additions', () => {
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');
		const add = vi.spyOn(DoublePrecisionFloat, 'add');
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		Long.dot(long, long);

		expect(multiply).toHaveBeenCalledTimes(LENGTH);
		expect(add).toHaveBeenCalledTimes(LENGTH - 1);
		expect(from).not.toHaveBeenCalled();
	});

	it('should convert each element once to make a value', () => {
		const elements: number[] = scattered();
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		Long.from(elements);

		expect(from).toHaveBeenCalledTimes(LENGTH);
	});

	it('should refuse the wrong length before converting anything', () => {
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		expect(() => Long.from(scattered().slice(1))).toThrow(RangeError);
		expect(from).not.toHaveBeenCalled();
	});

	it('should add with one addition per element', () => {
		const add = vi.spyOn(DoublePrecisionFloat, 'add');

		Long.add(long, long);

		expect(add).toHaveBeenCalledTimes(LENGTH);
	});
});
