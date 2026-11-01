import { describe, expect, expectTypeOf, it } from 'vitest';

import { DoublePrecisionFloat } from '@/src/doublePrecisionFloat';
import type { Encoding } from '@/src/fixedLayout';
import { struct } from '@/src/struct';

/**
 * Behaviour suite for `DoublePrecisionFloat`.
 *
 * Every `number` is already one, so the type must never change a value — the
 * suite asserts that nothing is rounded, not even the edge cases a careless
 * identity would normalise.
 */

describe('DoublePrecisionFloat', () => {
	it('should convert every number to itself, the edge cases included', () => {
		for (const value of [0.1, -0, Number.MIN_VALUE, Number.MAX_VALUE, -Infinity, 2 ** 53 + 2]) {
			expect(Object.is(DoublePrecisionFloat.from(value), value)).toBe(true);
		}

		expect(DoublePrecisionFloat.from(Number.NaN)).toBeNaN();
	});

	it('should compute exactly what the operators compute', () => {
		const left = DoublePrecisionFloat.from(0.1);
		const right = DoublePrecisionFloat.from(0.2);

		expect(DoublePrecisionFloat.add(left, right)).toBe(0.1 + 0.2);
		expect(DoublePrecisionFloat.subtract(left, right)).toBe(0.1 - 0.2);
		expect(DoublePrecisionFloat.multiply(left, right)).toBe(0.1 * 0.2);
		expect(DoublePrecisionFloat.divide(left, right)).toBe(0.1 / 0.2);
		expect(DoublePrecisionFloat.remainder(left, right)).toBe(0.1 % 0.2);
	});

	it('should report the range of a number, not its smallest positive value', () => {
		expect(DoublePrecisionFloat.maximum).toBe(Number.MAX_VALUE);
		expect(DoublePrecisionFloat.minimum).toBe(-Number.MAX_VALUE);
		expect(DoublePrecisionFloat.minimum).not.toBe(Number.MIN_VALUE);
	});

	it('should compute the operations behind the operators as the operators do', () => {
		const x = DoublePrecisionFloat.from(2);

		expect(DoublePrecisionFloat.power(x, DoublePrecisionFloat.from(10))).toBe(1024);
		expect(DoublePrecisionFloat.negate(x)).toBe(-2);
		expect(DoublePrecisionFloat.increment(x)).toBe(3);
		expect(DoublePrecisionFloat.greaterThanOrEqual(x, x)).toBe(true);
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
		expectTypeOf(DoublePrecisionFloat.from(1)).toEqualTypeOf<DoublePrecisionFloat>();
		expectTypeOf<DoublePrecisionFloat>().toExtend<number>();
		expectTypeOf<number>().not.toExtend<DoublePrecisionFloat>();
	});

	describe('bytes', () => {
		it('should take eight bytes, aligned on eight, encoded as a Float64, frozen', () => {
			expect(DoublePrecisionFloat.layout).toEqual({ size: 8, alignment: 8, encoding: 'Float64' });
			expect(Object.isFrozen(DoublePrecisionFloat.layout)).toBe(true);
		});

		it.each([0, -0, 0.1, -1e300, Number.MAX_VALUE, Number.MIN_VALUE, Infinity, -Infinity])(
			'should read back %s exactly, between neighbours it leaves alone',
			(source) => {
				const value = DoublePrecisionFloat.from(source);
				const bytes = new Uint8Array(24).fill(0xaa);
				const view = new DataView(bytes.buffer);

				DoublePrecisionFloat.write(view, 8, value);

				expect(Object.is(DoublePrecisionFloat.read(view, 8), value)).toBe(true);

				expect([...bytes.subarray(0, 8), ...bytes.subarray(16)]).toEqual(
					new Array<number>(16).fill(0xaa),
				);
			},
		);

		it('should read back NaN', () => {
			const view = new DataView(new ArrayBuffer(8));

			DoublePrecisionFloat.write(view, 0, DoublePrecisionFloat.from(NaN));

			expect(DoublePrecisionFloat.read(view, 0)).toBeNaN();
		});

		it('should write binary64, little-endian, as a struct field of the same type does', () => {
			const Holder = struct('Holder', { value: DoublePrecisionFloat });
			const alone = new Uint8Array(8);
			const inside = new Uint8Array(8);
			const value = DoublePrecisionFloat.from(1);

			DoublePrecisionFloat.write(new DataView(alone.buffer), 0, value);
			Holder.write(new DataView(inside.buffer), 0, Holder.from({ value }));

			expect([...alone]).toEqual([0, 0, 0, 0, 0, 0, 0xf0, 0x3f]);
			expect([...alone]).toEqual([...inside]);
		});

		it('should declare the layout of its type, and read values of its type', () => {
			expectTypeOf(DoublePrecisionFloat.layout).toEqualTypeOf<{
				readonly size: 8;
				readonly alignment: 8;
				readonly encoding: Encoding;
			}>();

			expectTypeOf(DoublePrecisionFloat)
				.toHaveProperty('read')
				.returns.toEqualTypeOf<DoublePrecisionFloat>();
		});
	});
});
