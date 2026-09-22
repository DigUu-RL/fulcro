import { describe, expect, expectTypeOf, it } from 'vitest';

import { HalfPrecisionFloat } from '@/halfPrecisionFloat';

/**
 * Behaviour suite for `HalfPrecisionFloat`.
 *
 * The format has only 65,536 bit patterns, so the suite does not sample it: it
 * decodes every one of them with a decoder written from the IEEE 754 layout —
 * independently of the rounding under test — and checks that each finite value
 * converts to itself, and that each midpoint between two neighbours converts to
 * the one with the even significand. That is the whole of round-to-nearest,
 * ties-to-even, asserted exhaustively and without depending on
 * `Math.f16round`, which Node 22 does not have.
 */

/**
 * Decodes a binary16 bit pattern.
 *
 * @param bits Sixteen bits: one of sign, five of exponent, ten of fraction.
 * @returns The value the pattern encodes.
 */
const decode = (bits: number): number => {
	const sign: number = bits & 0x8000 ? -1 : 1;
	const exponent: number = (bits >> 10) & 0x1f;
	const fraction: number = bits & 0x3ff;

	if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : Number.NaN;
	if (exponent === 0) return sign * fraction * 2 ** -24;

	return sign * (1024 + fraction) * 2 ** (exponent - 25);
};

/** Every positive finite value, in increasing order, with its bit pattern. */
const POSITIVE_FINITE: readonly {
	readonly bits: number;
	readonly value: number;
}[] = Array.from({ length: 0x7c00 }, (_, bits) => ({
	bits,
	value: decode(bits),
}));

describe('HalfPrecisionFloat', () => {
	it('should convert every one of the 65,536 patterns to itself', () => {
		let mismatches = 0;

		for (let bits = 0; bits <= 0xffff; bits++) {
			const value: number = decode(bits);
			const converted: number = HalfPrecisionFloat.from(value);

			if (
				!(Number.isNaN(value)
					? Number.isNaN(converted)
					: Object.is(converted, value))
			) {
				mismatches++;
			}
		}

		expect(mismatches).toBe(0);
	});

	it('should round every midpoint to the neighbour with the even significand', () => {
		const wrong: number[] = [];

		for (let index = 0; index + 1 < POSITIVE_FINITE.length; index++) {
			const low = POSITIVE_FINITE[index];
			const high = POSITIVE_FINITE[index + 1];
			const midpoint: number = (low.value + high.value) / 2;
			const even: number = low.bits % 2 === 0 ? low.value : high.value;

			if (HalfPrecisionFloat.from(midpoint) !== even) wrong.push(midpoint);
			if (HalfPrecisionFloat.from(-midpoint) !== -even) wrong.push(-midpoint);
		}

		expect(wrong).toEqual([]);
	});

	it('should round anything off a midpoint to the nearer neighbour', () => {
		const wrong: number[] = [];

		for (let index = 0; index + 1 < POSITIVE_FINITE.length; index += 7) {
			const low: number = POSITIVE_FINITE[index].value;
			const high: number = POSITIVE_FINITE[index + 1].value;
			const step: number = (high - low) / 4;

			if (HalfPrecisionFloat.from(low + step) !== low) wrong.push(low + step);
			if (HalfPrecisionFloat.from(high - step) !== high) {
				wrong.push(high - step);
			}
		}

		expect(wrong).toEqual([]);
	});

	it('should overflow to infinity from the midpoint above 65504', () => {
		expect(HalfPrecisionFloat.from(65504)).toBe(65504);
		expect(HalfPrecisionFloat.from(65519.99)).toBe(65504);
		expect(HalfPrecisionFloat.from(65520)).toBe(Infinity);
		expect(HalfPrecisionFloat.from(-65520)).toBe(-Infinity);
		expect(HalfPrecisionFloat.from(1e300)).toBe(Infinity);
	});

	it('should underflow to a zero that keeps its sign', () => {
		expect(Object.is(HalfPrecisionFloat.from(2 ** -26), 0)).toBe(true);
		expect(Object.is(HalfPrecisionFloat.from(-(2 ** -26)), -0)).toBe(true);
		expect(HalfPrecisionFloat.from(2 ** -24)).toBe(2 ** -24);
	});

	it('should pass NaN, the infinities and both zeros through', () => {
		expect(HalfPrecisionFloat.from(Number.NaN)).toBeNaN();
		expect(HalfPrecisionFloat.from(-Infinity)).toBe(-Infinity);
		expect(Object.is(HalfPrecisionFloat.from(-0), -0)).toBe(true);
	});

	it('should round the result of each operation once', () => {
		const one = HalfPrecisionFloat.from(1);
		const tiny = HalfPrecisionFloat.from(2 ** -11);

		// 1 + 2^-11 is exactly between 1 and 1 + 2^-10: ties to even, back to 1.
		expect(HalfPrecisionFloat.add(one, tiny)).toBe(1);
		expect(HalfPrecisionFloat.divide(one, HalfPrecisionFloat.from(3))).toBe(
			0.333251953125,
		);
		expect(
			HalfPrecisionFloat.multiply(
				HalfPrecisionFloat.from(300),
				HalfPrecisionFloat.from(300),
			),
		).toBe(Infinity);
		expect(HalfPrecisionFloat.subtract(one, one)).toBe(0);
		expect(
			HalfPrecisionFloat.remainder(
				HalfPrecisionFloat.from(7.5),
				HalfPrecisionFloat.from(2),
			),
		).toBe(1.5);
	});

	it('should recognise exactly the representable values', () => {
		expect(HalfPrecisionFloat.is(0.5)).toBe(true);
		expect(HalfPrecisionFloat.is(Number.NaN)).toBe(true);
		expect(HalfPrecisionFloat.is(0.1)).toBe(false);
		expect(HalfPrecisionFloat.is(65536)).toBe(false);
		expect(HalfPrecisionFloat.is('0.5')).toBe(false);
	});

	it('should refuse a bigint rather than round it twice', () => {
		expect(() => HalfPrecisionFloat.from(1n as unknown as number)).toThrow(
			'HalfPrecisionFloat.from: expected a number, received bigint.',
		);
	});

	it('should stay a number at the type level, and not a single precision one', () => {
		expectTypeOf(
			HalfPrecisionFloat.from(1),
		).toEqualTypeOf<HalfPrecisionFloat>();
		expectTypeOf<HalfPrecisionFloat>().toMatchTypeOf<number>();
		expectTypeOf<HalfPrecisionFloat>().not.toMatchTypeOf<
			import('@/singlePrecisionFloat').SinglePrecisionFloat
		>();
	});
});
