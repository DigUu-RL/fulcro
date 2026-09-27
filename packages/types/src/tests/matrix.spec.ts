import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { BigInteger } from '@/bigInteger';
import { ComplexNumber } from '@/complexNumber';
import { Decimal } from '@/decimal';
import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import type { Layout } from '@/layout';
import { type Matrix, Matrix as MatrixOf } from '@/matrix';
import { Quaternion } from '@/quaternion';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { struct } from '@/struct';
import { UnsignedInteger } from '@/unsignedInteger';
import { Vector } from '@/vector';

/**
 * Behaviour suite for `Matrix`.
 *
 * The value, the arithmetic — every element going through the element type's
 * own descriptor — the layout, which the type and the struct engine have to
 * agree on, and the shapes, which the compiler refuses before the runtime
 * does.
 */

/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with, which `toThrow` compares as well.
 *
 * @param error The expected error, its message starting with its code.
 * @returns The same error, carrying that code.
 */
const coded = <T extends Error>(error: T): T =>
	Object.assign(error, { code: error.message.slice(0, 'FULCRO0000'.length) });

const Pair = MatrixOf(DoublePrecisionFloat, 2, 3);
const Tall = MatrixOf(DoublePrecisionFloat, 3, 2);
const Square = MatrixOf(DoublePrecisionFloat, 2, 2);

const pair = Pair.from([
	[1, 2, 3],
	[4, 5, 6],
]);
const tall = Tall.from([
	[7, 8],
	[9, 10],
	[11, 12],
]);

describe('Matrix', () => {
	describe('values', () => {
		it('should hold its elements row after row, in a frozen array', () => {
			expect([...pair]).toEqual([1, 2, 3, 4, 5, 6]);
			expect(Array.isArray(pair)).toBe(true);
			expect(Object.isFrozen(pair)).toBe(true);
		});

		it('should carry its shape without listing it', () => {
			expect(pair.rows).toBe(2);
			expect(pair.columns).toBe(3);
			expect(Object.keys(pair)).toEqual(['0', '1', '2', '3', '4', '5']);
			expect(JSON.stringify(pair)).toBe('[1,2,3,4,5,6]');
		});

		it('should name itself after its element type and its shape', () => {
			expect(Pair.name).toBe('Matrix<DoublePrecisionFloat, 2, 3>');
			expect(Pair.rows).toBe(2);
			expect(Pair.columns).toBe(3);
		});

		it('should convert every element with the element type', () => {
			const Floats = MatrixOf(SinglePrecisionFloat, 1, 2);

			expect([...Floats.from([[0.1, 1e39]])]).toEqual([
				Math.fround(0.1),
				Infinity,
			]);
		});

		it('should infer the element type and the shape', () => {
			expectTypeOf(pair).toEqualTypeOf<Matrix<DoublePrecisionFloat, 2, 3>>();
			expectTypeOf(Pair.multiply(pair, tall)).toEqualTypeOf<
				Matrix<DoublePrecisionFloat, 2, 2>
			>();
			expectTypeOf(Pair.transpose(pair)).toEqualTypeOf<
				Matrix<DoublePrecisionFloat, 3, 2>
			>();
		});
	});

	describe('is', () => {
		it('should recognise its own values', () => {
			expect(Pair.is(pair)).toBe(true);
		});

		it('should refuse another shape of the same length', () => {
			expect(
				Pair.is(
					Tall.from([
						[1, 2],
						[3, 4],
						[5, 6],
					]),
				),
			).toBe(false);
		});

		it('should refuse an array that is not frozen or carries no shape', () => {
			expect(Pair.is([1, 2, 3, 4, 5, 6])).toBe(false);
			expect(Pair.is(Object.freeze([1, 2, 3, 4, 5, 6]))).toBe(false);
		});

		it('should refuse an element of another type', () => {
			const Floats = MatrixOf(SinglePrecisionFloat, 2, 3);

			expect(
				Floats.is(
					Pair.from([
						[0.1, 0, 0],
						[0, 0, 0],
					]),
				),
			).toBe(false);
		});

		it('should refuse what is not an array', () => {
			expect(Pair.is({ rows: 2, columns: 3 })).toBe(false);
			expect(Pair.is(null)).toBe(false);
		});
	});

	describe('arithmetic', () => {
		it('should add, subtract and negate element by element', () => {
			expect([...Pair.add(pair, pair)]).toEqual([2, 4, 6, 8, 10, 12]);
			expect([...Pair.subtract(pair, pair)]).toEqual([0, 0, 0, 0, 0, 0]);
			expect([...Pair.negate(pair)]).toEqual([-1, -2, -3, -4, -5, -6]);
		});

		it('should scale every element', () => {
			expect([...Pair.scale(pair, DoublePrecisionFloat.from(2))]).toEqual([
				2, 4, 6, 8, 10, 12,
			]);
		});

		it('should multiply a row of the left by a column of the right', () => {
			const product = Pair.multiply(pair, tall);

			expect([...product]).toEqual([58, 64, 139, 154]);
			expect([product.rows, product.columns]).toEqual([2, 2]);
			expect(Square.is(product)).toBe(true);
		});

		it('should multiply a matrix by a vector', () => {
			const Column = Vector(DoublePrecisionFloat, 3, 1);
			const moved = Pair.multiply(pair, Column.from([1, 0, 1]));

			expect([...moved]).toEqual([4, 10]);
			expect(Vector(DoublePrecisionFloat, 2, 1).is(moved)).toBe(true);
		});

		it('should keep the order of elements whose product does not commute', () => {
			const Rotation = Quaternion(DoublePrecisionFloat);
			const Single = MatrixOf(Rotation, 1, 1);
			const i = Single.from([[{ w: 0, x: 1, y: 0, z: 0 }]]);
			const j = Single.from([[{ w: 0, x: 0, y: 1, z: 0 }]]);

			expect(Single.multiply(i, j)[0]).toEqual({ w: 0, x: 0, y: 0, z: 1 });
			expect(Single.multiply(j, i)[0]).toEqual({ w: 0, x: 0, y: 0, z: -1 });
		});

		it('should transpose', () => {
			const transposed = Pair.transpose(pair);

			expect([...transposed]).toEqual([1, 4, 2, 5, 3, 6]);
			expect(Tall.is(transposed)).toBe(true);
		});

		it('should give a square matrix its identity, one shared value', () => {
			const Identity = MatrixOf(SignedInteger(32), 3, 3);

			expect([...Identity.identity()]).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
			expect(Identity.identity()).toBe(Identity.identity());
			expect(Object.isFrozen(Identity.identity())).toBe(true);
		});

		it('should keep the promise of the element type', () => {
			const Bytes = MatrixOf(SignedInteger(8), 1, 1);
			const large = Bytes.from([[100]]);

			expect(() => Bytes.add(large, large)).toThrow(RangeError);
		});

		it('should be exact over Decimal', () => {
			const Money = MatrixOf(Decimal, 1, 2);
			const sum = Money.add(Money.from([[0.1, 0.2]]), Money.from([[0.2, 0.1]]));

			expect(sum.map(String)).toEqual(['0.3', '0.3']);
		});

		it('should hold numbers as large as memory allows over BigInteger', () => {
			const Huge = MatrixOf(BigInteger, 1, 1);
			const big = Huge.from([[2n ** 100n]]);

			expect(Huge.multiply(big, big)[0]).toBe(2n ** 200n);
		});

		it('should compute over complex numbers', () => {
			const Complex = ComplexNumber(DoublePrecisionFloat);
			const Single = MatrixOf(Complex, 1, 1);
			const i = Single.from([[{ real: 0, imaginary: 1 }]]);

			expect(Single.multiply(i, i)[0]).toEqual({ real: -1, imaginary: 0 });
		});
	});

	describe('equals', () => {
		it('should compare element by element', () => {
			expect(
				Pair.equals(
					pair,
					Pair.from([
						[1, 2, 3],
						[4, 5, 6],
					]),
				),
			).toBe(true);
			expect(Pair.equals(pair, Pair.negate(pair))).toBe(false);
		});

		it('should find a matrix holding NaN unequal to itself', () => {
			const Single = MatrixOf(DoublePrecisionFloat, 1, 1);
			const value = Single.from([[NaN]]);

			expect(Single.equals(value, value)).toBe(false);
		});

		it('should find two shapes of the same length unequal', () => {
			expect(Pair.equals(pair, Pair.transpose(pair) as never)).toBe(false);
		});
	});

	describe('layout', () => {
		it('should declare its elements end to end', () => {
			expectTypeOf<
				Matrix<SinglePrecisionFloat, 3, 4>['~layout']
			>().toEqualTypeOf<{ readonly size: 48; readonly alignment: 4 }>();
			expectTypeOf<Matrix<Decimal, 4, 4>['~layout']>().toEqualTypeOf<{
				readonly size: 256;
				readonly alignment: 16;
			}>();
		});

		it('should declare no layout over a type that has none', () => {
			expectTypeOf<Matrix<BigInteger, 2, 2>>().not.toMatchTypeOf<
				Layout<number, number>
			>();
		});

		it('should be a field of a struct, laid out as its type declares', () => {
			const Transform = MatrixOf(SinglePrecisionFloat, 3, 4);
			const Placed = struct('Placed', {
				tag: UnsignedInteger(8),
				transform: Transform,
			});

			expect(Placed.layout.fields.transform).toEqual({
				offset: 0,
				size: 48,
				alignment: 4,
			});
			expectTypeOf(Placed.layout.fields.transform.size).toEqualTypeOf<48>();
		});

		it('should write its elements into bytes and read them back', () => {
			const Placed = struct('Placed', { transform: Pair });
			const value = Placed.from({
				transform: [
					[1, 2, 3],
					[4, 5, 6],
				],
			});
			const view = new DataView(new ArrayBuffer(Placed.layout.size));

			Placed.write(view, 0, value);

			expect(view.getFloat64(8, true)).toBe(2);

			const read = Placed.read(view, 0);

			expect(Pair.is(read.transform)).toBe(true);
			expect(Placed.equals(read, value)).toBe(true);
		});
	});

	describe('refusals', () => {
		it('should refuse an element type without arithmetic', () => {
			expect(() => MatrixOf({} as never, 2, 2)).toThrow(
				coded(
					new TypeError(
						'FULCRO6033: Matrix: expected a numeric type of @fulcro/types as the element type, received object.',
					),
				),
			);
		});

		it.each([0, -1, 1.5, Number.NaN])('should refuse %s rows', (rows) => {
			expect(() => MatrixOf(DoublePrecisionFloat, rows, 2)).toThrow(
				coded(
					new RangeError(
						`FULCRO6035: Matrix: expected a positive integer number of rows, received ${rows}.`,
					),
				),
			);
		});

		it('should refuse rows that are not an array', () => {
			expect(() => Pair.from('rows' as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO6034: Matrix<DoublePrecisionFloat, 2, 3>.from: expected an array, received string.',
					),
				),
			);
		});

		it('should refuse the wrong number of rows, and of elements in a row', () => {
			expect(() => Pair.from([[1, 2, 3]])).toThrow(
				coded(
					new RangeError(
						'FULCRO6038: Matrix<DoublePrecisionFloat, 2, 3>.from: expected 2 rows, received 1.',
					),
				),
			);
			expect(() =>
				Pair.from([
					[1, 2, 3],
					[4, 5],
				]),
			).toThrow(
				coded(
					new RangeError(
						'FULCRO6038: Matrix<DoublePrecisionFloat, 2, 3>.from: expected 3 elements in row 1, received 2.',
					),
				),
			);
		});

		it('should name the element its own type refused, keeping its code', () => {
			expect(() =>
				Pair.from([
					[1, 2, 3],
					[4, 'x' as never, 6],
				]),
			).toThrow(
				coded(
					new TypeError(
						'FULCRO6006: Matrix<DoublePrecisionFloat, 2, 3>.from: row 1, column 1: DoublePrecisionFloat.from: expected a number, received string.',
					),
				),
			);
		});

		it('should refuse a product whose shapes do not meet, past the compiler', () => {
			expect(() => Pair.multiply(pair, pair as never)).toThrow(
				coded(
					new RangeError(
						'FULCRO6037: Cannot multiply Matrix<DoublePrecisionFloat, 2, 3> by Matrix<DoublePrecisionFloat, 2, 3>. Expected a matrix with 3 rows.',
					),
				),
			);
		});

		it('should refuse an operand of another shape', () => {
			expect(() => Square.add(Square.identity(), pair as never)).toThrow(
				coded(
					new RangeError(
						'FULCRO6036: Matrix<DoublePrecisionFloat, 2, 2>.add: expected a Matrix<DoublePrecisionFloat, 2, 2>, received a Matrix<DoublePrecisionFloat, 2, 3>.',
					),
				),
			);
		});

		it('should refuse an operand that is not a matrix', () => {
			expect(() => Pair.negate([1, 2, 3, 4, 5, 6] as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO6034: Matrix<DoublePrecisionFloat, 2, 3>.negate: expected an array, received an array without a shape.',
					),
				),
			);
		});

		it('should refuse an identity to a matrix that is not square, past the compiler', () => {
			expect(() => (Pair as never as typeof Square).identity()).toThrow(
				coded(
					new RangeError(
						'FULCRO6039: Matrix<DoublePrecisionFloat, 2, 3>.identity: only a square matrix has an identity.',
					),
				),
			);
		});
	});
});

/** The compilers, as the package each is installed under. */
const COMPILERS = [
	['TypeScript 5', 'typescript'],
	['TypeScript 7', 'typescript7'],
] as const;

/**
 * Type checks the fixture of refused shapes.
 *
 * Driven through the `tsc` binary, as `@fulcro/errors`' compile-time suite is,
 * because TypeScript 7 no longer exposes a compiler API.
 *
 * @param packageName Package the compiler is installed under.
 * @returns Everything the compiler printed.
 */
const compileRejected = (packageName: string): string => {
	const workspace: string = path.resolve(__dirname, '../../../..');

	try {
		execFileSync(
			process.execPath,
			[
				path.join(workspace, 'node_modules', packageName, 'bin', 'tsc'),
				'--pretty',
				'false',
				'-p',
				path.resolve(__dirname, 'matrix.rejected.tsconfig.json'),
			],
			{ cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
		);

		return '';
	} catch (failure) {
		const { stdout, stderr } = failure as { stdout?: string; stderr?: string };

		return `${stdout ?? ''}${stderr ?? ''}`;
	}
};

describe.each(COMPILERS)(
	'Matrix shapes at compile time, on %s',
	(_label, name) => {
		const report: string = compileRejected(name);
		const lines: number[] = [
			...new Set(
				[...report.matchAll(/rejected\.fixture\.ts[:(](\d+)/g)].map((match) =>
					Number(match[1]),
				),
			),
		];

		it('should refuse a product whose shapes do not meet, quoting why', () => {
			expect(lines).toContain(22);
			expect(report).toContain(
				'Cannot multiply Matrix<T, 3, 4> by Vector<T, 2, 1>. Expected a vector with 4 rows.',
			);
			expect(lines).toContain(25);
			expect(report).toContain(
				'Cannot multiply Matrix<T, 3, 4> by Matrix<T, 3, 4>. Expected a matrix with 4 rows.',
			);
		});

		it('should refuse an identity to a matrix that is not square', () => {
			expect(lines).toContain(29);
		});

		it('should refuse to add matrices of different shapes', () => {
			expect(lines).toContain(33);
		});

		it('should report nothing else', () => {
			expect(lines).toEqual([22, 25, 29, 33]);
		});
	},
);
