import { describe, expect, expectTypeOf, it } from 'vitest';

import { DoublePrecisionFloat } from '@/src/doublePrecisionFloat';
import { type Quaternion, Quaternion as QuaternionOf } from '@/src/quaternion';
import type { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
import { struct } from '@/src/struct';

/**
 * Behaviour suite for `Quaternion`.
 *
 * Hamilton's product and everything built on it — the conjugate, the
 * quotient — with the order of the operands kept, since it does not commute.
 */

/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with and the details it was made from, which `toThrow` compares as
 * well.
 *
 * @param error The expected error, its message starting with its code.
 * @param details The details the error is expected to carry.
 * @returns The same error, carrying that code and those details.
 */
const coded = <T extends Error>(error: T, details: Readonly<Record<string, unknown>>): T => {
	return Object.assign(error, {
		code: error.message.slice(0, 'FULCRO0000'.length),
		details,
	});
};

const Rotation = QuaternionOf(DoublePrecisionFloat);
const one = Rotation.from(1);
const unitI = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
const unitJ = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });
const unitK = Rotation.from({ w: 0, x: 0, y: 0, z: 1 });
const quaternion = Rotation.from({ w: 1, x: 2, y: 3, z: 4 });

describe('Quaternion', () => {
	describe('values', () => {
		it('should hold its four components in a frozen object', () => {
			expect(quaternion).toEqual({ w: 1, x: 2, y: 3, z: 4 });
			expect(Object.keys(quaternion)).toEqual(['w', 'x', 'y', 'z']);
			expect(Object.isFrozen(quaternion)).toBe(true);
		});

		it('should make a real number from a number alone', () => {
			expect(one).toEqual({ w: 1, x: 0, y: 0, z: 0 });
		});

		it('should name itself after its component type', () => {
			expect(Rotation.name).toBe('Quaternion<DoublePrecisionFloat>');
		});

		it('should infer the component type', () => {
			expectTypeOf(quaternion).toEqualTypeOf<Quaternion<DoublePrecisionFloat>>();
		});

		it('should recognise its own values and nothing else', () => {
			expect(Rotation.is(quaternion)).toBe(true);
			expect(Rotation.is({ w: 1, x: 2, y: 3, z: 4 })).toBe(false);
			expect(Rotation.is(Object.freeze({ w: 1, x: 2, y: 3 }))).toBe(false);
		});
	});

	describe('arithmetic', () => {
		it.each([
			['i', unitI],
			['j', unitJ],
			['k', unitK],
		])('should square %s into minus one', (_name, unit) => {
			expect(Rotation.multiply(unit, unit)).toEqual({
				w: -1,
				x: 0,
				y: 0,
				z: 0,
			});
		});

		it('should follow ij = k, jk = i and ki = j', () => {
			expect(Rotation.multiply(unitI, unitJ)).toEqual(unitK);
			expect(Rotation.multiply(unitJ, unitK)).toEqual(unitI);
			expect(Rotation.multiply(unitK, unitI)).toEqual(unitJ);
		});

		// Compared with the type's own `equals` rather than `toEqual`: negating
		// the zero components gives `-0`, which `toEqual` tells apart from `0`
		// and the float's arithmetic does not.
		it('should keep the order of its operands', () => {
			expect(Rotation.equals(Rotation.multiply(unitJ, unitI), Rotation.negate(unitK))).toBe(true);
			expect(Rotation.equals(Rotation.multiply(unitJ, unitI), unitK)).toBe(false);
		});

		it('should give ijk = −1', () => {
			expect(
				Rotation.equals(
					Rotation.multiply(Rotation.multiply(unitI, unitJ), unitK),
					Rotation.negate(one),
				),
			).toBe(true);
		});

		it('should add, subtract, negate and scale component by component', () => {
			expect(Rotation.add(quaternion, one)).toEqual({ w: 2, x: 2, y: 3, z: 4 });
			expect(Rotation.subtract(quaternion, one)).toEqual({ w: 0, x: 2, y: 3, z: 4 });
			expect(Rotation.negate(quaternion)).toEqual({ w: -1, x: -2, y: -3, z: -4 });

			expect(Rotation.scale(quaternion, DoublePrecisionFloat.from(2))).toEqual({
				w: 2,
				x: 4,
				y: 6,
				z: 8,
			});
		});

		it('should conjugate every imaginary component', () => {
			expect(Rotation.conjugate(quaternion)).toEqual({ w: 1, x: -2, y: -3, z: -4 });
		});

		it('should give q × conjugate(q) its squared norm', () => {
			expect(Rotation.multiply(quaternion, Rotation.conjugate(quaternion))).toEqual({
				w: 30,
				x: 0,
				y: 0,
				z: 0,
			});
		});

		it('should divide by multiplying by the inverse on the right', () => {
			expect(Rotation.divide(quaternion, quaternion)).toEqual(one);
			expect(Rotation.divide(Rotation.multiply(unitI, unitJ), unitJ)).toEqual(unitI);
		});

		it('should compare component by component', () => {
			expect(Rotation.equals(quaternion, Rotation.from({ w: 1, x: 2, y: 3, z: 4 }))).toBe(true);
			expect(Rotation.equals(quaternion, one)).toBe(false);
		});
	});

	describe('layout', () => {
		it('should declare its four components end to end', () => {
			expectTypeOf<Quaternion<SinglePrecisionFloat>['~layout']>().toEqualTypeOf<{
				readonly size: 16;
				readonly alignment: 4;
			}>();
		});

		it('should be stored by a struct in the order w, x, y, z', () => {
			const Pose = struct('Pose', { orientation: Rotation });
			const view = new DataView(new ArrayBuffer(Pose.layout.size));

			Pose.write(view, 0, Pose.from({ orientation: { w: 1, x: 2, y: 3, z: 4 } }));

			expect([0, 8, 16, 24].map((offset) => view.getFloat64(offset, true))).toEqual([1, 2, 3, 4]);
			expect(Pose.read(view, 0).orientation).toEqual(quaternion);
		});
	});

	describe('refusals', () => {
		it('should refuse a component it does not have', () => {
			expect(() => Rotation.from({ w: 1, x: 0, y: 0, z: 0, v: 0 } as never)).toThrow(
				coded(
					new TypeError(
						"FULCRO6020: Quaternion<DoublePrecisionFloat>.from: 'v' is not a field; the fields are w, x, y, z.",
					),
					{
						operation: 'Quaternion<DoublePrecisionFloat>.from',
						key: 'v',
						fields: 'w, x, y, z',
					},
				),
			);
		});

		it('should refuse a missing component', () => {
			expect(() => Rotation.from({ w: 1, x: 0, y: 0 } as never)).toThrow(
				coded(
					new TypeError("FULCRO6021: Quaternion<DoublePrecisionFloat>.from: missing field 'z'."),
					{ operation: 'Quaternion<DoublePrecisionFloat>.from', field: 'z' },
				),
			);
		});
	});
});
