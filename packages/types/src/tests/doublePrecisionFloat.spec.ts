import { describe, expect, expectTypeOf, it } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';

/**
 * Behaviour suite for `DoublePrecisionFloat`.
 *
 * Every `number` is already one, so the type must never change a value — the
 * suite asserts that nothing is rounded, not even the edge cases a careless
 * identity would normalise.
 */

describe('DoublePrecisionFloat', () => {
	it('should convert every number to itself, the edge cases included', () => {
		for (const value of [
			0.1,
			-0,
			Number.MIN_VALUE,
			Number.MAX_VALUE,
			-Infinity,
			2 ** 53 + 2,
		]) {
			expect(Object.is(DoublePrecisionFloat.from(value), value)).toBe(true);
		}

		expect(DoublePrecisionFloat.from(Number.NaN)).toBeNaN();
	});

	it('should compute exactly what the operators compute', () => {
		const a = DoublePrecisionFloat.from(0.1);
		const b = DoublePrecisionFloat.from(0.2);

		expect(DoublePrecisionFloat.add(a, b)).toBe(0.1 + 0.2);
		expect(DoublePrecisionFloat.subtract(a, b)).toBe(0.1 - 0.2);
		expect(DoublePrecisionFloat.multiply(a, b)).toBe(0.1 * 0.2);
		expect(DoublePrecisionFloat.divide(a, b)).toBe(0.1 / 0.2);
		expect(DoublePrecisionFloat.remainder(a, b)).toBe(0.1 % 0.2);
	});

	it('should recognise every number and nothing else', () => {
		expect(DoublePrecisionFloat.is(0.1)).toBe(true);
		expect(DoublePrecisionFloat.is(Number.NaN)).toBe(true);
		expect(DoublePrecisionFloat.is(1n)).toBe(false);
		expect(DoublePrecisionFloat.is('0.1')).toBe(false);
	});

	it('should refuse what is not a number', () => {
		expect(() => DoublePrecisionFloat.from(1n as unknown as number)).toThrow(
			'DoublePrecisionFloat.from: expected a number, received bigint.',
		);
	});

	it('should need a conversion to be told apart from a plain number', () => {
		expectTypeOf(
			DoublePrecisionFloat.from(1),
		).toEqualTypeOf<DoublePrecisionFloat>();
		expectTypeOf<DoublePrecisionFloat>().toMatchTypeOf<number>();
		expectTypeOf<number>().not.toMatchTypeOf<DoublePrecisionFloat>();
	});
});
