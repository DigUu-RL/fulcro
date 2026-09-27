import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { describe, expect, expectTypeOf, it } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { Matrix } from '@/matrix';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { type Vector, Vector as VectorOf } from '@/vector';

/**
 * Behaviour suite for `Vector`.
 *
 * A vector is a matrix with one row or one column, and the same type as the
 * matrix of its shape: the suite holds both halves of that — what a vector
 * adds, a flat `from` and the dot product, and that it goes wherever its
 * matrix goes.
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

const Column = VectorOf(DoublePrecisionFloat, 3, 1);
const Row = VectorOf(DoublePrecisionFloat, 1, 3);

describe('Vector', () => {
	describe('values', () => {
		it('should make a column and a row from one flat list', () => {
			const column = Column.from([1, 2, 3]);
			const row = Row.from([1, 2, 3]);

			expect([...column]).toEqual([1, 2, 3]);
			expect([column.rows, column.columns]).toEqual([3, 1]);
			expect([row.rows, row.columns]).toEqual([1, 3]);
			expect(Object.isFrozen(column)).toBe(true);
		});

		it('should name itself as a vector', () => {
			expect(Column.name).toBe('Vector<DoublePrecisionFloat, 3, 1>');
		});

		it('should be the matrix of its shape', () => {
			const column = Column.from([1, 2, 3]);

			expect(Matrix(DoublePrecisionFloat, 3, 1).is(column)).toBe(true);
			expect(
				Column.is(Matrix(DoublePrecisionFloat, 3, 1).from([[1], [2], [3]])),
			).toBe(true);
			expectTypeOf(column).toEqualTypeOf<Vector<DoublePrecisionFloat, 3, 1>>();
			expectTypeOf(column).toEqualTypeOf<Matrix<DoublePrecisionFloat, 3, 1>>();
		});

		it('should tell a row from a column of the same length', () => {
			expect(Column.is(Row.from([1, 2, 3]))).toBe(false);
		});
	});

	describe('arithmetic', () => {
		it('should take the dot product', () => {
			expect(Column.dot(Column.from([1, 2, 3]), Column.from([4, 5, 6]))).toBe(
				32,
			);
		});

		it('should take the dot product in the element type', () => {
			const Floats = VectorOf(SinglePrecisionFloat, 1, 2);
			const value = Floats.from([0.1, 0.2]);

			expect(Floats.dot(value, value)).toBe(
				Math.fround(
					Math.fround(Math.fround(0.1) * Math.fround(0.1)) +
						Math.fround(Math.fround(0.2) * Math.fround(0.2)),
				),
			);
		});

		it('should add, subtract, negate and scale as a matrix', () => {
			const value = Column.from([1, 2, 3]);

			expect([...Column.add(value, value)]).toEqual([2, 4, 6]);
			expect([...Column.subtract(value, value)]).toEqual([0, 0, 0]);
			expect([...Column.negate(value)]).toEqual([-1, -2, -3]);
			expect([...Column.scale(value, DoublePrecisionFloat.from(3))]).toEqual([
				3, 6, 9,
			]);
		});

		it('should multiply a row by a column into a matrix of one element', () => {
			const product = Row.multiply(Row.from([1, 2, 3]), Column.from([4, 5, 6]));

			expect([...product]).toEqual([32]);
			expect([product.rows, product.columns]).toEqual([1, 1]);
		});

		it('should multiply a column by a row into a matrix', () => {
			const product = Column.multiply(
				Column.from([1, 2, 3]),
				Row.from([1, 2, 3]),
			);

			expect(Matrix(DoublePrecisionFloat, 3, 3).is(product)).toBe(true);
			expect([...product]).toEqual([1, 2, 3, 2, 4, 6, 3, 6, 9]);
		});

		it('should turn a column into a row by transposing it', () => {
			expect(Row.is(Column.transpose(Column.from([1, 2, 3])))).toBe(true);
		});

		it('should keep the promise of the element type', () => {
			const Bytes = VectorOf(SignedInteger(8), 2, 1);
			const value = Bytes.from([100, 100]);

			expect(() => Bytes.dot(value, value)).toThrow(RangeError);
		});
	});

	describe('refusals', () => {
		it('should refuse a shape with neither one row nor one column, past the compiler', () => {
			expect(() => VectorOf(DoublePrecisionFloat, 2, 3 as never)).toThrow(
				coded(
					new RangeError(
						'FULCRO6040: Vector: expected one row or one column, received 2 rows and 3 columns. A shape with neither is a Matrix.',
					),
				),
			);
		});

		it('should refuse elements that are not an array', () => {
			expect(() => Column.from(3 as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO6034: Vector<DoublePrecisionFloat, 3, 1>.from: expected an array, received number.',
					),
				),
			);
		});

		it('should refuse the wrong number of elements', () => {
			expect(() => Column.from([1, 2])).toThrow(
				coded(
					new RangeError(
						'FULCRO6038: Vector<DoublePrecisionFloat, 3, 1>.from: expected 3 elements, received 2.',
					),
				),
			);
		});

		it('should name the element its own type refused, keeping its code', () => {
			expect(() => Column.from([1, 'x' as never, 3])).toThrow(
				coded(
					new TypeError(
						'FULCRO6006: Vector<DoublePrecisionFloat, 3, 1>.from: element 1: DoublePrecisionFloat.from: expected a number, received string.',
					),
				),
			);
		});

		it('should refuse a dot product of different shapes, past the compiler', () => {
			expect(() =>
				Column.dot(Column.from([1, 2, 3]), Row.from([1, 2, 3]) as never),
			).toThrow(
				coded(
					new RangeError(
						'FULCRO6036: Vector<DoublePrecisionFloat, 3, 1>.dot: expected a Vector<DoublePrecisionFloat, 3, 1>, received a Vector<DoublePrecisionFloat, 1, 3>.',
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
				path.resolve(__dirname, 'vector.rejected.tsconfig.json'),
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
	'Vector shapes at compile time, on %s',
	(_label, name) => {
		const report: string = compileRejected(name);
		const lines: number[] = [
			...new Set(
				[...report.matchAll(/rejected\.fixture\.ts[:(](\d+)/g)].map((match) =>
					Number(match[1]),
				),
			),
		];

		it('should refuse a shape with neither one row nor one column, quoting why', () => {
			expect(lines).toContain(15);
			expect(report).toContain(
				'A vector has one row or one column; Vector<T, 2, 3> has neither. Declare it with Matrix.',
			);
		});

		it('should refuse a dot product of vectors of different lengths', () => {
			expect(lines).toContain(19);
		});

		it('should refuse a dot product of a column and a row', () => {
			expect(lines).toContain(22);
		});

		it('should report nothing else', () => {
			expect(lines).toEqual([15, 19, 22]);
		});
	},
);
