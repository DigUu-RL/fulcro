import { describe, expect, expectTypeOf, it } from 'vitest';

import { BigInteger } from '@/bigInteger';

/** Behaviour suite for `BigInteger`. */

describe('BigInteger', () => {
	it('should convert a number, a bigint and a decimal string exactly', () => {
		expect(BigInteger.from(42)).toBe(42n);
		expect(BigInteger.from(-(2 ** 60))).toBe(-(2n ** 60n));
		expect(BigInteger.from(7n)).toBe(7n);
		expect(BigInteger.from('-123456789012345678901234567890')).toBe(
			-123456789012345678901234567890n,
		);
		expect(BigInteger.from('+5')).toBe(5n);
	});

	it('should refuse a number with a fraction, and the non-finite ones', () => {
		expect(() => BigInteger.from(1.5)).toThrow(
			'BigInteger.from: expected an integer, received 1.5.',
		);
		expect(() => BigInteger.from(Infinity)).toThrow(RangeError);
		expect(() => BigInteger.from(Number.NaN)).toThrow(RangeError);
	});

	it('should refuse the literal forms BigInt takes and a decimal type should not', () => {
		for (const text of ['0x10', '0b101', ' 5', '5 ', '1e3', '1.0', '']) {
			expect(() => BigInteger.from(text)).toThrow(SyntaxError);
		}
	});

	it('should refuse a value of another kind', () => {
		expect(() => BigInteger.from(true as unknown as number)).toThrow(TypeError);
	});

	it('should compute without overflow, and truncate the quotient', () => {
		const huge = BigInteger.from(2n ** 200n);

		expect(BigInteger.multiply(huge, huge)).toBe(2n ** 400n);
		expect(BigInteger.add(huge, BigInteger.from(1))).toBe(2n ** 200n + 1n);
		expect(BigInteger.subtract(BigInteger.from(1), huge)).toBe(1n - 2n ** 200n);
		expect(BigInteger.divide(BigInteger.from(-7), BigInteger.from(2))).toBe(
			-3n,
		);
		expect(BigInteger.remainder(BigInteger.from(-7), BigInteger.from(2))).toBe(
			-1n,
		);
	});

	it('should refuse a zero divisor, naming the operation', () => {
		expect(() =>
			BigInteger.divide(BigInteger.from(1n), BigInteger.from(0n)),
		).toThrow('BigInteger.divide: division by zero.');
		expect(() =>
			BigInteger.remainder(BigInteger.from(1n), BigInteger.from(0n)),
		).toThrow('BigInteger.remainder: division by zero.');
	});

	it('should compute the operations behind the operators without bound', () => {
		const two = BigInteger.from(2);

		expect(BigInteger.power(two, BigInteger.from(200))).toBe(2n ** 200n);
		expect(BigInteger.negate(two)).toBe(-2n);
		expect(BigInteger.increment(two)).toBe(3n);
		expect(BigInteger.decrement(two)).toBe(1n);
		expect(BigInteger.lessThan(two, BigInteger.from(3))).toBe(true);
		expect(() => BigInteger.power(two, BigInteger.from(-1))).toThrow(
			'BigInteger.power: expected an exponent of zero or more, received -1n.',
		);
	});

	it('should have no bounds to report', () => {
		expect(BigInteger).not.toHaveProperty('minimum');
		expect(BigInteger).not.toHaveProperty('maximum');
	});

	it('should recognise a bigint and nothing else', () => {
		expect(BigInteger.is(1n)).toBe(true);
		expect(BigInteger.is(1)).toBe(false);
	});

	it('should be a branded bigint at the type level, with no layout', () => {
		expectTypeOf(BigInteger.from(1)).toEqualTypeOf<BigInteger>();
		expectTypeOf<BigInteger>().toMatchTypeOf<bigint>();
		expectTypeOf<bigint>().not.toMatchTypeOf<BigInteger>();
		expectTypeOf<BigInteger>().not.toHaveProperty('~layout');
	});
});
