import { describe, expect, expectTypeOf, it } from 'vitest';

import { allocate } from '@/allocate';
import { createArenaAllocator } from '@/arenaAllocator';
import { asReadOnlyView } from '@/asReadOnlyView';
import { asView } from '@/asView';
import { createManagedStorage } from '@/managedStorage';
import { pointerTo } from '@/pointerTo';
import { referenceTo } from '@/referenceTo';
import type { Storage } from '@/storage';
import type { ReadOnlyView, View } from '@/view';

import { coded } from './coded';

/**
 * Behaviour suite for `asReadOnlyView`, and for the `ReadOnlyView<T>` it
 * returns.
 *
 * What sets it apart from `asView`: it accepts what can only be read — a
 * read-only array, a read-only view, a reference with no `set` — and what it
 * returns cannot be written, in its type or at runtime.
 */

/**
 * A storage of `length` numbers holding `0, 1, 2, …`.
 *
 * @param length How many.
 * @returns The storage.
 */
const counting = (length: number): Storage<number> => {
	const numbers: Storage<number> = createManagedStorage(length, 0);

	for (let index = 0; index < length; index++) numbers.set(index, index);

	return numbers;
};

/**
 * Every value a view observes, in order.
 *
 * @param view The view.
 * @returns Its values.
 */
const valuesOf = <T>(view: ReadOnlyView<T>): T[] =>
	Array.from({ length: view.length }, (_, index) => view.get(index));

describe('asReadOnlyView', () => {
	it('should observe a storage, with bounds or without', () => {
		expect(valuesOf(asReadOnlyView(counting(4)))).toEqual([0, 1, 2, 3]);
		expect(valuesOf(asReadOnlyView(counting(6), 2, 3))).toEqual([2, 3, 4]);
	});

	it('should observe a read-only array in place', () => {
		const levels: readonly number[] = [10, 20, 30];

		expect(valuesOf(asReadOnlyView(levels, 1))).toEqual([20, 30]);
	});

	it('should see a write made to its source', () => {
		const levels: number[] = [1, 2, 3];
		const view: ReadOnlyView<number> = asReadOnlyView(levels);

		levels[0] = 100;

		expect(view.get(0)).toBe(100);
	});

	it('should observe a read-only view, a view, a pointer and a reference', () => {
		const numbers: Storage<number> = counting(8);

		expect(valuesOf(asReadOnlyView(asReadOnlyView(numbers, 2), 1, 2))).toEqual([
			3, 4,
		]);
		expect(valuesOf(asReadOnlyView(asView(numbers, 5)))).toEqual([5, 6, 7]);
		expect(valuesOf(asReadOnlyView(pointerTo(numbers, 6), 2))).toEqual([6, 7]);
		expect(valuesOf(asReadOnlyView(referenceTo('only')))).toEqual(['only']);
	});

	it('should have no set, nor a way back to one', () => {
		const view: ReadOnlyView<number> = asReadOnlyView(counting(3));

		expect(Object.keys(view).sort()).toEqual(['get', 'length', 'subview']);
		expect(Object.isFrozen(view)).toBe(true);
		expect('set' in view.subview(1)).toBe(false);
	});

	it('should refuse an index outside it, under its own name', () => {
		expect(() => asReadOnlyView(counting(5), 1, 2).get(2)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7002: ReadOnlyView.get: index 2 is outside a storage of length 2.',
				),
				{ operation: 'ReadOnlyView.get', index: 2, length: 2 },
			),
		);
	});

	it('should refuse a position the array shrank past', () => {
		const levels: number[] = [1, 2, 3];
		const view: ReadOnlyView<number> = asReadOnlyView(levels);

		levels.pop();

		expect(() => view.get(2)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7015: ReadOnlyView.get: position 2 is past the end of the array, which now holds 2 values; it shrank after it was viewed.',
				),
				{ operation: 'ReadOnlyView.get', index: 2, length: 2 },
			),
		);
	});

	it('should refuse a region that does not fit', () => {
		expect(() => asReadOnlyView(counting(3), 2, 2)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7014: asReadOnlyView: 2 values from position 2 do not fit in a source of 3.',
				),
				{ operation: 'asReadOnlyView', start: 2, length: 2, available: 3 },
			),
		);
	});

	it('should refuse what is not a source', () => {
		expect(() =>
			asReadOnlyView(7 as unknown as readonly number[]),
		).toThrowError(
			coded(
				new TypeError(
					'FULCRO7017: asReadOnlyView: expected a storage, a view, a read-only view, an array, a pointer or a memory reference, received number.',
				),
				{
					operation: 'asReadOnlyView',
					expected:
						'a storage, a view, a read-only view, an array, a pointer or a memory reference',
					received: 'number',
				},
			),
		);
	});

	it('should refuse every access once the allocator released its memory', () => {
		const arena = createArenaAllocator(64);
		const view: ReadOnlyView<number> = asReadOnlyView(
			allocate(
				{
					name: 'Byte',
					layout: { size: 1, alignment: 1 },
					read: (bytes: DataView, offset: number) => bytes.getUint8(offset),
					write: (bytes: DataView, offset: number, value: number) => {
						bytes.setUint8(offset, value);
					},
					is: (value: unknown): value is number => typeof value === 'number',
				},
				4,
				arena,
			),
		);

		arena.reset();

		expect(() => view.get(0)).toThrowError(
			expect.objectContaining({ code: 'FULCRO7009' }),
		);
	});
});

describe('ReadOnlyView.subview', () => {
	it('should observe part of it, read-only too', () => {
		const part: ReadOnlyView<number> = asReadOnlyView(counting(10), 2).subview(
			3,
			2,
		);

		expect(valuesOf(part)).toEqual([5, 6]);
	});

	it('should stay inside the view', () => {
		expect(() => asReadOnlyView(counting(10), 0, 3).subview(1, 3)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7014: ReadOnlyView.subview: 3 values from position 1 do not fit in a source of 3.',
				),
				{
					operation: 'ReadOnlyView.subview',
					start: 1,
					length: 3,
					available: 3,
				},
			),
		);
	});
});

describe('asReadOnlyView types', () => {
	it('should infer the type of the values from its source', () => {
		const levels: readonly string[] = ['a'];

		expectTypeOf(asReadOnlyView(levels)).toEqualTypeOf<ReadOnlyView<string>>();
		expectTypeOf(asReadOnlyView(counting(1))).toEqualTypeOf<
			ReadOnlyView<number>
		>();
		expectTypeOf(asReadOnlyView(asView(counting(1)).readOnly())).toEqualTypeOf<
			ReadOnlyView<number>
		>();
		expectTypeOf(asReadOnlyView(referenceTo(true))).toEqualTypeOf<
			ReadOnlyView<boolean>
		>();
	});

	it('should not be a view', () => {
		expectTypeOf(asReadOnlyView(counting(1))).not.toExtend<View<number>>();
	});
});
