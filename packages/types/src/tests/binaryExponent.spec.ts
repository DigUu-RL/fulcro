import { describe, expect, it } from 'vitest';

import { binaryExponentOf } from '@/src/float/binaryExponent';

/**
 * Behaviour suite for `binaryExponentOf`, the exponent both the half precision
 * type and the struct codec round through.
 *
 * What it exists for is the place `Math.log2` gets wrong: the values right next
 * to a power of two, where its estimate can land one off on either side. So the
 * assertions sit on the powers themselves and their neighbours.
 */

/**
 * The value the next representable double away from `value` holds.
 *
 * @param value Positive, finite value.
 * @param direction `1` for the next one up, `-1` for the next one down.
 * @returns The neighbouring double.
 */
const neighbour = (value: number, direction: 1 | -1): number => {
	const view = new DataView(new ArrayBuffer(8));

	view.setFloat64(0, value);
	view.setBigUint64(0, view.getBigUint64(0) + BigInt(direction));

	return view.getFloat64(0);
};

describe('binaryExponentOf', () => {
	it('should answer the exponent of every power of two a double holds', () => {
		const wrong: number[] = [];

		for (let exponent = -1074; exponent <= 1023; exponent++) {
			if (binaryExponentOf(2 ** exponent) !== exponent) wrong.push(exponent);
		}

		expect(wrong).toEqual([]);
	});

	it('should keep the value just below a power of two under it', () => {
		const wrong: number[] = [];

		for (let exponent = -1000; exponent <= 1023; exponent++) {
			if (binaryExponentOf(neighbour(2 ** exponent, -1)) !== exponent - 1) wrong.push(exponent);
		}

		expect(wrong).toEqual([]);
	});

	it('should keep the value just above a power of two at it', () => {
		const wrong: number[] = [];

		for (let exponent = -1000; exponent <= 1022; exponent++) {
			if (binaryExponentOf(neighbour(2 ** exponent, 1)) !== exponent) wrong.push(exponent);
		}

		expect(wrong).toEqual([]);
	});

	it('should place a value between powers at the lower one', () => {
		expect(binaryExponentOf(3)).toBe(1);
		expect(binaryExponentOf(0.75)).toBe(-1);
		expect(binaryExponentOf(65_504)).toBe(15);
	});
});
