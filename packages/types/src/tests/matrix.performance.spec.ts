import { afterEach, describe, expect, it, vi } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { Matrix } from '@/matrix';
import { struct } from '@/struct';

/**
 * Performance suite for `Matrix`.
 *
 * A matrix does its arithmetic through the element type's descriptor, so what
 * it costs is exactly how often it asks that descriptor for something. The
 * suite counts those calls: the product of an R × C matrix by a C × K one is
 * R·C·K multiplications and R·(C−1)·K additions — no zero is ever converted to
 * start a sum, and nothing is recomputed — and the operations that only move
 * elements around ask for nothing at all.
 */

/** Rows, columns and the right operand's columns of the large product. */
const SIZE = 24;

/**
 * Elements of a matrix whose values are all different and not in order, so no
 * shortcut an ordered or uniform input would allow can go unnoticed.
 *
 * @param rows Number of rows.
 * @param columns Number of columns.
 * @returns The rows.
 */
const scattered = (rows: number, columns: number): number[][] =>
	Array.from({ length: rows }, (_row, row) =>
		Array.from(
			{ length: columns },
			(_column, column) => ((row * 31 + column * 17) % 97) - 48,
		),
	);

const Large = Matrix(DoublePrecisionFloat, SIZE, SIZE);
const large = Large.from(scattered(SIZE, SIZE));

afterEach(() => {
	vi.restoreAllMocks();
});

describe('Matrix', () => {
	it('should multiply with R·C·K products and R·(C−1)·K additions, and nothing else', () => {
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');
		const add = vi.spyOn(DoublePrecisionFloat, 'add');
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		Large.multiply(large, large);

		expect(multiply).toHaveBeenCalledTimes(SIZE ** 3);
		expect(add).toHaveBeenCalledTimes(SIZE * (SIZE - 1) * SIZE);
		expect(from).not.toHaveBeenCalled();
	});

	it('should scale the product with the shape of the right operand', () => {
		const Wide = Matrix(DoublePrecisionFloat, SIZE, 2);
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');

		Large.multiply(large, Wide.from(scattered(SIZE, 2)));

		expect(multiply).toHaveBeenCalledTimes(SIZE * SIZE * 2);
	});

	it('should add, subtract, negate and scale with one operation per element', () => {
		const add = vi.spyOn(DoublePrecisionFloat, 'add');
		const subtract = vi.spyOn(DoublePrecisionFloat, 'subtract');
		const negate = vi.spyOn(DoublePrecisionFloat, 'negate');
		const multiply = vi.spyOn(DoublePrecisionFloat, 'multiply');

		Large.add(large, large);
		Large.subtract(large, large);
		Large.negate(large);
		Large.scale(large, DoublePrecisionFloat.from(3));

		for (const operation of [add, subtract, negate, multiply]) {
			expect(operation).toHaveBeenCalledTimes(SIZE * SIZE);
		}
	});

	it('should transpose without asking the element type for anything', () => {
		const spies = (
			['add', 'subtract', 'multiply', 'negate', 'from', 'is'] as const
		).map((name) => vi.spyOn(DoublePrecisionFloat, name));

		Large.transpose(large);

		for (const spy of spies) expect(spy).not.toHaveBeenCalled();
	});

	it('should stop comparing at the first element that differs', () => {
		const other = Large.negate(large);
		const equals = vi.spyOn(DoublePrecisionFloat, 'equals');

		Large.equals(large, other);

		expect(equals).toHaveBeenCalledTimes(1);

		equals.mockClear();
		Large.equals(large, large);

		expect(equals).toHaveBeenCalledTimes(SIZE * SIZE);
	});

	it('should convert its zero and its one once, however often the identity is asked for', () => {
		const Square = Matrix(DoublePrecisionFloat, SIZE, SIZE);
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		for (let index = 0; index < 1_000; index++) Square.identity();

		expect(from).toHaveBeenCalledTimes(2);
	});

	it('should check each element once to recognise a value', () => {
		const is = vi.spyOn(DoublePrecisionFloat, 'is');

		Large.is(large);

		expect(is).toHaveBeenCalledTimes(SIZE * SIZE);
	});

	it('should convert each element once to make a value', () => {
		const rows: number[][] = scattered(SIZE, SIZE);
		const from = vi.spyOn(DoublePrecisionFloat, 'from');

		Large.from(rows);

		expect(from).toHaveBeenCalledTimes(SIZE * SIZE);
	});

	it('should touch the bytes once per element to write and once to read', () => {
		const Holder = struct('Holder', { transform: Large });
		const view = new DataView(new ArrayBuffer(Holder.layout.size));
		const value = Holder.from({ transform: scattered(SIZE, SIZE) });
		let accesses = 0;

		for (const accessor of ['getFloat64', 'setFloat64'] as const) {
			const original = DataView.prototype[accessor] as (
				...parameters: unknown[]
			) => unknown;

			Object.defineProperty(view, accessor, {
				value: (...parameters: unknown[]): unknown => {
					accesses++;

					return original.apply(view, parameters);
				},
			});
		}

		Holder.write(view, 0, value);
		Holder.read(view, 0);

		expect(accesses).toBe(2 * SIZE * SIZE);
	});
});
