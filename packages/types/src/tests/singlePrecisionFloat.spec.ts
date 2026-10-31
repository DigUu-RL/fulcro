import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DoublePrecisionFloat } from '@/src/doublePrecisionFloat';
import { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
import { struct } from '@/src/struct';

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

			if (!Number.isNaN(value) && !Object.is(SinglePrecisionFloat.from(value), value)) {
				mismatches++;
			}
		}

		expect(mismatches).toBe(0);
	});

	it('should overflow past the largest finite value, and keep the sign of an underflow', () => {
		expect(SinglePrecisionFloat.from(3.4028234663852886e38)).toBe(3.4028234663852886e38);
		expect(SinglePrecisionFloat.from(1e39)).toBe(Infinity);
		expect(Object.is(SinglePrecisionFloat.from(-1e-50), -0)).toBe(true);
	});

	it('should round each operation back into the format', () => {
		const left = SinglePrecisionFloat.from(0.1);
		const right = SinglePrecisionFloat.from(0.2);

		// Left in double precision the sum would be 0.30000000447034836.
		expect(SinglePrecisionFloat.add(left, right)).toBe(0.30000001192092896);
		expect(SinglePrecisionFloat.subtract(right, left)).toBe(Math.fround(right - left));
		expect(SinglePrecisionFloat.multiply(left, right)).toBe(Math.fround(left * right));
		expect(SinglePrecisionFloat.divide(left, right)).toBe(0.5);

		expect(
			SinglePrecisionFloat.remainder(SinglePrecisionFloat.from(7.5), SinglePrecisionFloat.from(2)),
		).toBe(1.5);
	});

	it('should report its finite range, symmetric about zero', () => {
		expect(SinglePrecisionFloat.maximum).toBe(3.4028234663852886e38);
		expect(SinglePrecisionFloat.minimum).toBe(-3.4028234663852886e38);
		expect(SinglePrecisionFloat.is(SinglePrecisionFloat.maximum)).toBe(true);

		expect(SinglePrecisionFloat.increment(SinglePrecisionFloat.maximum)).toBe(
			SinglePrecisionFloat.maximum,
		);
	});

	it('should recognise exactly the representable values', () => {
		expect(SinglePrecisionFloat.is(0.5)).toBe(true);
		expect(SinglePrecisionFloat.is(0.1)).toBe(false);
		expect(SinglePrecisionFloat.is(Number.NaN)).toBe(true);
		expect(SinglePrecisionFloat.is(1n)).toBe(false);
	});

	it('should refuse what is not a number', () => {
		expect(() => SinglePrecisionFloat.from('1' as unknown as number)).toThrow(TypeError);
	});

	it('should be its own type, not a double precision one', () => {
		expectTypeOf(SinglePrecisionFloat.from(1)).toEqualTypeOf<SinglePrecisionFloat>();

		expectTypeOf<SinglePrecisionFloat>().not.toExtend<DoublePrecisionFloat>();
	});

	describe('bytes', () => {
		it('should take four bytes, aligned on four, frozen', () => {
			expect(SinglePrecisionFloat.layout).toEqual({ size: 4, alignment: 4 });
			expect(Object.isFrozen(SinglePrecisionFloat.layout)).toBe(true);
		});

		it.each([
			0,
			-0,
			1,
			-0.1,
			SinglePrecisionFloat.maximum,
			SinglePrecisionFloat.minimum,
			// The smallest subnormal, 2^-149.
			2 ** -149,
			Infinity,
			-Infinity,
		])('should read back %s exactly, between neighbours it leaves alone', (source) => {
			const value = SinglePrecisionFloat.from(source);
			const bytes = new Uint8Array(12).fill(0xaa);
			const view = new DataView(bytes.buffer);

			SinglePrecisionFloat.write(view, 4, value);

			expect(Object.is(SinglePrecisionFloat.read(view, 4), value)).toBe(true);

			expect([...bytes.subarray(0, 4), ...bytes.subarray(8)]).toEqual(
				new Array<number>(8).fill(0xaa),
			);
		});

		it('should read back NaN', () => {
			const view = new DataView(new ArrayBuffer(4));

			SinglePrecisionFloat.write(view, 0, SinglePrecisionFloat.from(NaN));

			expect(SinglePrecisionFloat.read(view, 0)).toBeNaN();
		});

		it('should write binary32, little-endian, as a struct field of the same type does', () => {
			const Holder = struct('Holder', { value: SinglePrecisionFloat });
			const alone = new Uint8Array(4);
			const inside = new Uint8Array(4);
			const value = SinglePrecisionFloat.from(1);

			SinglePrecisionFloat.write(new DataView(alone.buffer), 0, value);
			Holder.write(new DataView(inside.buffer), 0, Holder.from({ value }));

			expect([...alone]).toEqual([0x00, 0x00, 0x80, 0x3f]);
			expect([...alone]).toEqual([...inside]);
		});

		it('should declare the layout of its type, and read values of its type', () => {
			expectTypeOf(SinglePrecisionFloat.layout).toEqualTypeOf<{
				readonly size: 4;
				readonly alignment: 4;
			}>();

			expectTypeOf(SinglePrecisionFloat)
				.toHaveProperty('read')
				.returns.toEqualTypeOf<SinglePrecisionFloat>();
		});
	});
});
