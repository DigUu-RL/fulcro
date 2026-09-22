import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat } from '@/singlePrecisionFloat';

/**
 * Behaviour suite for `SinglePrecisionFloat`.
 *
 * The rounding itself is `Math.fround`, which the platform specifies, so what
 * is asserted here is what the type adds: the bit patterns it round-trips, the
 * boundaries of the format, and arithmetic rounded once to it rather than left
 * in double precision.
 */

/**
 * Decodes a binary32 bit pattern through a typed array, the platform's own
 * reading of the format.
 *
 * @param bits Thirty-two bits.
 * @returns The value the pattern encodes.
 */
const decode = (bits: number): number => {
	const view = new DataView(new ArrayBuffer(4));

	view.setUint32(0, bits);

	return view.getFloat32(0);
};

describe('SinglePrecisionFloat', () => {
	it('should round to the nearest single precision value', () => {
		expect(SinglePrecisionFloat.from(0.1)).toBe(0.10000000149011612);
		expect(SinglePrecisionFloat.from(16_777_217)).toBe(16_777_216);
	});

	it('should convert patterns across the whole format to themselves', () => {
		let mismatches = 0;

		// Every 65,537th pattern: all exponents, both signs, subnormals and the
		// specials, without four billion iterations.
		for (let bits = 0; bits <= 0xffff_ffff; bits += 65_537) {
			const value: number = decode(bits);

			if (
				!Number.isNaN(value) &&
				!Object.is(SinglePrecisionFloat.from(value), value)
			) {
				mismatches++;
			}
		}

		expect(mismatches).toBe(0);
	});

	it('should overflow past the largest finite value, and keep the sign of an underflow', () => {
		expect(SinglePrecisionFloat.from(3.4028234663852886e38)).toBe(
			3.4028234663852886e38,
		);
		expect(SinglePrecisionFloat.from(1e39)).toBe(Infinity);
		expect(Object.is(SinglePrecisionFloat.from(-1e-50), -0)).toBe(true);
	});

	it('should round each operation back into the format', () => {
		const a = SinglePrecisionFloat.from(0.1);
		const b = SinglePrecisionFloat.from(0.2);

		// Left in double precision the sum would be 0.30000000447034836.
		expect(SinglePrecisionFloat.add(a, b)).toBe(0.30000001192092896);
		expect(SinglePrecisionFloat.subtract(b, a)).toBe(Math.fround(b - a));
		expect(SinglePrecisionFloat.multiply(a, b)).toBe(Math.fround(a * b));
		expect(SinglePrecisionFloat.divide(a, b)).toBe(0.5);
		expect(
			SinglePrecisionFloat.remainder(
				SinglePrecisionFloat.from(7.5),
				SinglePrecisionFloat.from(2),
			),
		).toBe(1.5);
	});

	it('should recognise exactly the representable values', () => {
		expect(SinglePrecisionFloat.is(0.5)).toBe(true);
		expect(SinglePrecisionFloat.is(0.1)).toBe(false);
		expect(SinglePrecisionFloat.is(Number.NaN)).toBe(true);
		expect(SinglePrecisionFloat.is(1n)).toBe(false);
	});

	it('should refuse what is not a number', () => {
		expect(() => SinglePrecisionFloat.from('1' as unknown as number)).toThrow(
			TypeError,
		);
	});

	it('should be its own type, not a double precision one', () => {
		expectTypeOf(
			SinglePrecisionFloat.from(1),
		).toEqualTypeOf<SinglePrecisionFloat>();
		expectTypeOf<SinglePrecisionFloat>().not.toMatchTypeOf<
			import('@/doublePrecisionFloat').DoublePrecisionFloat
		>();
	});
});
