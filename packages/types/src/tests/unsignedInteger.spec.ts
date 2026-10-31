import { describe, expect, expectTypeOf, it } from 'vitest';

import type { IntegerType } from '@/src/integer';
import type { SignedInteger } from '@/src/signedInteger';
import { struct } from '@/src/struct';
import { UnsignedInteger } from '@/src/unsignedInteger';

/**
 * Behaviour suite for `UnsignedInteger`.
 *
 * The same boundaries as the signed suite, with the one an unsigned type adds:
 * zero is the minimum, so the subtraction everyone writes without thinking —
 * `count - 1` — is the one that overflows.
 */

/** Range of each width, computed independently of the implementation. */
const RANGES = [
	{ width: 8, maximum: 255n },
	{ width: 16, maximum: 65_535n },
	{ width: 32, maximum: 4_294_967_295n },
	{ width: 64, maximum: 2n ** 64n - 1n },
	{ width: 128, maximum: 2n ** 128n - 1n },
] as const;

/**
 * Converts an exact integer into the primitive a width is carried by.
 *
 * @param width Width, in bits.
 * @param value Exact value.
 * @returns A `number` up to 32 bits, a `bigint` from 64.
 */
const carried = (width: number, value: bigint): number | bigint => {
	return width >= 64 ? value : Number(value);
};

describe('UnsignedInteger', () => {
	describe.each(RANGES)('at $width bits', ({ width, maximum }) => {
		const type = UnsignedInteger(width) as IntegerType<number | bigint>;

		it('should report a range starting at zero', () => {
			expect(type.minimum).toBe(carried(width, 0n));
			expect(type.maximum).toBe(carried(width, maximum));
			expect(type.signed).toBe(false);
			expect(type.name).toBe(`UnsignedInteger<${String(width)}>`);
		});

		it('should accept both ends and refuse one past either', () => {
			expect(type.from(0)).toBe(carried(width, 0n));
			expect(type.from(maximum)).toBe(carried(width, maximum));

			expect(() => type.from(-1)).toThrow(
				`UnsignedInteger<${String(width)}>.from: -1 is outside [0, ${String(maximum)}].`,
			);

			expect(() => type.from(maximum + 1n)).toThrow(RangeError);
		});

		it('should wrap a negative value to the top of the range', () => {
			expect(type.wrap(-1)).toBe(carried(width, maximum));
			expect(type.wrap(maximum + 1n)).toBe(carried(width, 0n));

			const modulus: bigint = 2n ** BigInt(width);

			for (const value of [-modulus * 7n + 3n, modulus * 11n + 5n]) {
				expect(type.wrap(value)).toBe(carried(width, BigInt.asUintN(width, value)));
			}
		});

		it('should refuse a subtraction below zero', () => {
			expect(() => type.subtract(type.from(0), type.from(1))).toThrow(
				`UnsignedInteger<${String(width)}>.subtract: -1${width >= 64 ? 'n' : ''} is outside [0, ${String(maximum)}].`,
			);
		});

		it('should refuse an addition past the maximum', () => {
			expect(() => type.add(type.maximum, type.from(1))).toThrow(RangeError);
		});

		it('should divide, and refuse a zero divisor', () => {
			expect(type.divide(type.from(9), type.from(4))).toBe(carried(width, 2n));
			expect(type.remainder(type.from(9), type.from(4))).toBe(carried(width, 1n));
			expect(() => type.divide(type.from(9), type.from(0))).toThrow(RangeError);
		});

		it('should multiply up to the maximum and refuse past it', () => {
			expect(type.multiply(type.from(carried(width, maximum / 3n)), type.from(3))).toBe(
				carried(width, maximum),
			);

			expect(() => type.multiply(type.maximum, type.from(2))).toThrow(RangeError);
		});

		it('should recognise its own values and nothing else', () => {
			expect(type.is(type.maximum)).toBe(true);
			expect(type.is(width >= 64 ? -1n : -1)).toBe(false);
		});
	});

	describe.each(RANGES)(
		'the operations behind the operators, at $width bits',
		({ width, maximum }) => {
			const type = UnsignedInteger(width) as IntegerType<number | bigint>;
			const convert = (value: bigint): number | bigint => type.from(carried(width, value));

			it('should negate only zero', () => {
				expect(type.negate(convert(0n))).toBe(carried(width, 0n));
				expect(() => type.negate(convert(1n))).toThrow(`UnsignedInteger<${String(width)}>.negate`);
			});

			it('should refuse to step below zero', () => {
				expect(() => type.decrement(convert(0n))).toThrow(RangeError);
				expect(type.increment(convert(0n))).toBe(carried(width, 1n));
			});

			it('should complement and shift over the unsigned bits', () => {
				expect(type.bitwiseNot(convert(0n))).toBe(carried(width, maximum));
				expect(type.shiftLeft(type.maximum, convert(1n))).toBe(carried(width, maximum - 1n));
				expect(type.shiftRight(type.maximum, convert(BigInt(width - 1)))).toBe(carried(width, 1n));

				expect(type.shiftRightLogical(type.maximum, convert(1n))).toBe(
					type.shiftRight(type.maximum, convert(1n)),
				);
			});

			it('should raise to a power up to the maximum and refuse past it', () => {
				expect(type.power(convert(2n), convert(BigInt(width - 1)))).toBe(
					carried(width, 2n ** BigInt(width - 1)),
				);

				expect(() => type.power(convert(2n), convert(BigInt(width)))).toThrow(RangeError);
			});
		},
	);

	it('should mask a number of any size exactly', () => {
		// Past 2^53, but still exact: 2^60 + 2^9 is a double.
		expect(UnsignedInteger(32).wrap(2 ** 60 + 2 ** 9)).toBe(2 ** 9);
		expect(UnsignedInteger(16).wrap(-(2 ** 40) - 1)).toBe(65_535);
	});

	it('should return one descriptor per width', () => {
		expect(UnsignedInteger(8)).toBe(UnsignedInteger(8));
	});

	it('should be told apart from the signed type of the same width', () => {
		expectTypeOf(UnsignedInteger(16).from(1)).toEqualTypeOf<UnsignedInteger<16>>();

		expectTypeOf<UnsignedInteger<16>>().not.toExtend<SignedInteger<16>>();

		expectTypeOf(UnsignedInteger(64).from(1)).toExtend<bigint>();
	});

	describe('bytes', () => {
		describe.each(RANGES)('at $width bits', ({ width, maximum }) => {
			const type = UnsignedInteger(width) as IntegerType<number | bigint>;
			const size: number = width / 8;

			it('should take width / 8 bytes, aligned on as many, frozen', () => {
				expect(type.layout).toEqual({ size, alignment: size });
				expect(Object.isFrozen(type.layout)).toBe(true);
			});

			it.each([
				['zero', 0n],
				['one', 1n],
				['the maximum', maximum],
				['the top bit alone', (maximum + 1n) / 2n],
			])('should read back %s, between neighbours it leaves alone', (_label, value) => {
				const bytes = new Uint8Array(size * 3).fill(0xaa);
				const view = new DataView(bytes.buffer);

				type.write(view, size, carried(width, value));

				expect(type.read(view, size)).toBe(carried(width, value));

				expect([...bytes.subarray(0, size), ...bytes.subarray(size * 2)]).toEqual(
					new Array<number>(size * 2).fill(0xaa),
				);
			});

			it('should store a value as a struct field of the same type does', () => {
				const Holder = struct('Holder', { value: UnsignedInteger(width) });
				const alone = new Uint8Array(size);
				const inside = new Uint8Array(size);
				const value = carried(width, maximum - 1n);

				type.write(new DataView(alone.buffer), 0, value);
				Holder.write(new DataView(inside.buffer), 0, Holder.from({ value }));

				expect([...alone]).toEqual([...inside]);
			});
		});

		it('should write little-endian', () => {
			const view = new DataView(new ArrayBuffer(16));
			const bytes = new Uint8Array(view.buffer);

			UnsignedInteger(32).write(view, 0, UnsignedInteger(32).from(0x01020304));

			expect([...bytes.subarray(0, 4)]).toEqual([4, 3, 2, 1]);

			UnsignedInteger(128).write(view, 0, UnsignedInteger(128).from(2n ** 64n));

			expect([...bytes]).toEqual([
				...new Array<number>(8).fill(0),
				1,
				...new Array<number>(7).fill(0),
			]);
		});

		it('should declare the layout of its type, and read values of its type', () => {
			expectTypeOf(UnsignedInteger(16).layout).toEqualTypeOf<{
				readonly size: 2;
				readonly alignment: 2;
			}>();

			expectTypeOf(UnsignedInteger(128))
				.toHaveProperty('read')
				.returns.toEqualTypeOf<UnsignedInteger<128>>();
		});
	});
});
