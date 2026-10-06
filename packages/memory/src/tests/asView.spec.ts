import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/allocate';
import { createArenaAllocator } from '@/arenaAllocator';
import { asReadOnlyView } from '@/asReadOnlyView';
import { asView } from '@/asView';
import { createFixedBufferStorage } from '@/fixedBufferStorage';
import { createManagedStorage } from '@/managedStorage';
import type { MemoryReference } from '@/memoryReference';
import { pointerTo } from '@/pointerTo';
import { referenceTo } from '@/referenceTo';
import type { Storage } from '@/storage';
import type { ReadOnlyView, View } from '@/view';

import { coded } from './coded';

/**
 * Behaviour suite for `asView`, and for the `View<T>` it returns.
 *
 * The contract suite runs over a view too, as one more `Storage<T>`. What is
 * here is what a view adds: it observes a region of somebody else's values —
 * a storage, an array, a pointer's neighbourhood, a reference — without
 * copying them, without owning them, and without outliving their memory.
 */

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

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

describe('asView over a storage', () => {
	it('should observe the whole storage when given no bounds', () => {
		expect(valuesOf(asView(counting(4)))).toEqual([0, 1, 2, 3]);
	});

	it('should observe from a start to the end', () => {
		expect(valuesOf(asView(counting(5), 2))).toEqual([2, 3, 4]);
	});

	it('should observe a start and a length', () => {
		const view: View<number> = asView(counting(10), 3, 4);

		expect(view.length).toBe(4);
		expect(valuesOf(view)).toEqual([3, 4, 5, 6]);
	});

	it('should write through to the source, at the shifted position', () => {
		const numbers: Storage<number> = counting(6);

		asView(numbers, 2, 3).set(1, 99);

		expect(numbers.get(3)).toBe(99);
	});

	it('should see a write made to the source after it was made', () => {
		const numbers: Storage<number> = counting(4);
		const view: View<number> = asView(numbers, 1);

		numbers.set(2, -5);

		expect(view.get(1)).toBe(-5);
	});

	it('should observe a struct storage, its values read from the bytes', () => {
		const points = createFixedBufferStorage(Point, 3);
		const tail: View<Point> = asView(points, 1);

		tail.set(1, Point.from({ x: 4, y: 5 }));

		expect(Point.equals(points.get(2), Point.from({ x: 4, y: 5 }))).toBe(true);
	});

	it('should allow an empty region, at the end too', () => {
		expect(asView(counting(3), 3).length).toBe(0);
		expect(asView(counting(3), 1, 0).length).toBe(0);
		expect(asView(createManagedStorage(0, 0)).length).toBe(0);
	});

	it.each([
		[4, undefined, 4, 0],
		[-1, undefined, -1, 4],
		[1, 4, 1, 4],
		[0, -1, 0, -1],
		[1.5, 1, 1.5, 1],
		[0, 2.5, 0, 2.5],
		[Number.NaN, 1, Number.NaN, 1],
	])(
		'should refuse start %s and length %s on a source of 3',
		(start, length, shownStart, shownLength) => {
			expect(() => asView(counting(3), start, length)).toThrowError(
				coded(
					new RangeError(
						`FULCRO7014: asView: ${shownLength} values from position ${shownStart} do not fit in a source of 3.`,
					),
					{
						operation: 'asView',
						start: shownStart,
						length: shownLength,
						available: 3,
					},
				),
			);
		},
	);
});

describe('asView over an array', () => {
	it('should observe the array in place, both ways', () => {
		const names: string[] = ['a', 'b', 'c'];
		const view: View<string> = asView(names, 1);

		view.set(0, 'B');
		names[2] = 'C';

		expect(names).toEqual(['a', 'B', 'C']);
		expect(valuesOf(view)).toEqual(['B', 'C']);
	});

	it('should keep the length it was made with when the array grows', () => {
		const names: string[] = ['a', 'b'];
		const view: View<string> = asView(names);

		names.push('c');

		expect(view.length).toBe(2);
	});

	it('should refuse a position the array shrank past, never read undefined', () => {
		const names: string[] = ['a', 'b', 'c'];
		const view: View<string> = asView(names, 1);

		names.length = 2;

		expect(view.get(0)).toBe('b');
		expect(() => view.get(1)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7015: View.get: position 2 is past the end of the array, which now holds 2 values; it shrank after it was viewed.',
				),
				{ operation: 'View.get', index: 2, length: 2 },
			),
		);
		expect(() => view.set(1, 'z')).toThrowError(
			coded(
				new RangeError(
					'FULCRO7015: View.set: position 2 is past the end of the array, which now holds 2 values; it shrank after it was viewed.',
				),
				{ operation: 'View.set', index: 2, length: 2 },
			),
		);
		expect(names).toEqual(['a', 'b']);
	});
});

describe('asView over a pointer or a reference', () => {
	it('should observe one value where a pointer points, by default', () => {
		const numbers: Storage<number> = counting(5);
		const view: View<number> = asView(pointerTo(numbers, 3));

		expect(valuesOf(view)).toEqual([3]);
	});

	it('should observe a length from where a pointer points', () => {
		const numbers: Storage<number> = counting(5);
		const view: View<number> = asView(pointerTo(numbers, 1).offset(1), 3);

		view.set(2, 40);

		expect(valuesOf(view)).toEqual([2, 3, 40]);
		expect(numbers.get(4)).toBe(40);
	});

	it('should observe an empty region from a pointer at the end', () => {
		expect(asView(pointerTo(counting(2), 2), 0).length).toBe(0);
	});

	it('should refuse a region running past the end of the pointer', () => {
		expect(() => asView(pointerTo(counting(5), 3), 3)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7014: asView: 3 values from position 3 do not fit in a source of 5.',
				),
				{ operation: 'asView', start: 3, length: 3, available: 5 },
			),
		);
		expect(() => asView(pointerTo(counting(2), 2))).toThrowError(RangeError);
	});

	it('should observe a reference as a view of length 1, both ways', () => {
		const total: MemoryReference<number> = referenceTo(7);
		const view: View<number> = asView(total);

		view.set(0, 8);

		expect(view.length).toBe(1);
		expect(total.get()).toBe(8);
		expect(() => view.get(1)).toThrowError(RangeError);
	});

	it('should observe a reference written outside the package', () => {
		let held = 'a';
		const view: View<string> = asView({
			get: () => held,
			set: (value: string) => {
				held = value;
			},
		});

		view.set(0, 'b');

		expect(held).toBe('b');
	});
});

describe('asView over a view', () => {
	it('should observe a view as a storage, shifted twice', () => {
		const numbers: Storage<number> = counting(10);
		const inner: View<number> = asView(asView(numbers, 2), 3, 2);

		inner.set(0, -1);

		expect(numbers.get(5)).toBe(-1);
		expect(valuesOf(inner)).toEqual([-1, 6]);
	});
});

describe('asView refusals', () => {
	it.each([
		[null, 'null'],
		[undefined, 'undefined'],
		[42, 'number'],
		['abc', 'string'],
		[{}, 'an object without get'],
		[{ length: 2 }, 'an object without get'],
	])('should refuse %s as a source', (source, received) => {
		expect(() => asView(source as unknown as Storage<number>)).toThrowError(
			coded(
				new TypeError(
					`FULCRO7017: asView: expected a storage, a view, an array, a pointer or a memory reference, received ${received}.`,
				),
				{
					operation: 'asView',
					expected:
						'a storage, a view, an array, a pointer or a memory reference',
					received,
				},
			),
		);
	});

	it('should refuse a read-only view, which has nothing to write with', () => {
		const readOnly: ReadOnlyView<number> = asReadOnlyView(counting(3));

		expect(() => asView(readOnly as unknown as Storage<number>)).toThrowError(
			coded(
				new TypeError(
					'FULCRO7017: asView: expected a storage, a view, an array, a pointer or a memory reference, received an object with get but no set.',
				),
				{
					operation: 'asView',
					expected:
						'a storage, a view, an array, a pointer or a memory reference',
					received: 'an object with get but no set',
				},
			),
		);
	});
});

describe('View<T>', () => {
	it.each([
		[-1, '-1'],
		[2, '2'],
		[0.5, '0.5'],
		[Number.NaN, 'NaN'],
	])(
		'should refuse index %s, inside the source but outside the view',
		(index, shown) => {
			const view: View<number> = asView(counting(10), 4, 2);

			expect(() => view.get(index)).toThrowError(
				coded(
					new RangeError(
						`FULCRO7002: View.get: index ${shown} is outside a storage of length 2.`,
					),
					{ operation: 'View.get', index, length: 2 },
				),
			);
			expect(() => view.set(index, 0)).toThrowError(
				coded(
					new RangeError(
						`FULCRO7002: View.set: index ${shown} is outside a storage of length 2.`,
					),
					{ operation: 'View.set', index, length: 2 },
				),
			);
		},
	);

	it('should be frozen, with nothing to release and no source to reach', () => {
		const view: View<number> = asView(counting(2));

		expect(Object.isFrozen(view)).toBe(true);
		expect(Object.keys(view).sort()).toEqual([
			'get',
			'length',
			'readOnly',
			'set',
			'subview',
		]);
	});

	it('should work with its methods taken off the object', () => {
		const { get, set, subview } = asView(counting(4));

		set(0, 10);

		expect(get(0)).toBe(10);
		expect(subview(1).get(0)).toBe(1);
	});

	it('should refuse every access once the allocator released its memory', () => {
		const arena = createArenaAllocator(256);
		const points = allocate(Point, 4, arena);
		const view: View<Point> = asView(points, 1, 2);

		view.set(0, Point.from({ x: 1, y: 1 }));
		arena.reset();
		allocate(Point, 4, arena).set(1, Point.from({ x: 9, y: 9 }));

		expect(() => view.get(0)).toThrowError(
			coded(
				new Error(
					'FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'Storage.get' },
			),
		);
		expect(() => view.set(0, Point.from({ x: 2, y: 2 }))).toThrowError(
			coded(
				new Error(
					'FULCRO7009: Storage.set: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'Storage.set' },
			),
		);
	});
});

describe('View.subview', () => {
	it('should observe part of the view, shifted onto the source', () => {
		const numbers: Storage<number> = counting(10);
		const part: View<number> = asView(numbers, 2, 6).subview(1, 3);

		part.set(2, 50);

		expect(valuesOf(part)).toEqual([3, 4, 50]);
		expect(numbers.get(5)).toBe(50);
	});

	it('should observe the rest of the view when given no length', () => {
		expect(valuesOf(asView(counting(6), 1, 4).subview(2))).toEqual([3, 4]);
	});

	it('should stay inside the view, even where the source goes on', () => {
		const view: View<number> = asView(counting(10), 0, 4);

		expect(() => view.subview(2, 3)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7014: View.subview: 3 values from position 2 do not fit in a source of 4.',
				),
				{ operation: 'View.subview', start: 2, length: 3, available: 4 },
			),
		);
		expect(() => view.subview(5)).toThrowError(RangeError);
		expect(() => view.subview(-1)).toThrowError(RangeError);
	});

	it('should nest, each level shifted onto the original source', () => {
		const numbers: Storage<number> = counting(20);
		let view: View<number> = asView(numbers);

		for (let level = 0; level < 5; level++) {
			view = view.subview(2, view.length - 3);
		}

		expect(view.length).toBe(5);
		expect(valuesOf(view)).toEqual([10, 11, 12, 13, 14]);
	});
});

describe('View.readOnly', () => {
	it('should observe the same region, with no set at all', () => {
		const numbers: Storage<number> = counting(5);
		const readOnly: ReadOnlyView<number> = asView(numbers, 1, 3).readOnly();

		numbers.set(2, 77);

		expect(valuesOf(readOnly)).toEqual([1, 77, 3]);
		expect('set' in readOnly).toBe(false);
		expect('readOnly' in readOnly).toBe(false);
		expect(Object.isFrozen(readOnly)).toBe(true);
	});
});

describe('asView types', () => {
	it('should infer the type of the values from its source', () => {
		expectTypeOf(asView(counting(1))).toEqualTypeOf<View<number>>();
		expectTypeOf(asView(['a'])).toEqualTypeOf<View<string>>();
		expectTypeOf(asView(createFixedBufferStorage(Point, 1))).toEqualTypeOf<
			View<Point>
		>();
		expectTypeOf(asView(pointerTo([true], 0), 1)).toEqualTypeOf<
			View<boolean>
		>();
		expectTypeOf(asView(referenceTo(1n))).toEqualTypeOf<View<bigint>>();
	});

	it('should be a storage and a read-only view, and the reverse not', () => {
		expectTypeOf<View<number>>().toExtend<Storage<number>>();
		expectTypeOf<View<number>>().toExtend<ReadOnlyView<number>>();
		expectTypeOf<ReadOnlyView<number>>().not.toExtend<View<number>>();
		expectTypeOf<ReadOnlyView<number>>().not.toHaveProperty('set');
	});

	it('should accept what it can write, and not a read-only array or view', () => {
		expectTypeOf(asView).toBeCallableWith([1, 2]);
		expectTypeOf(asView).toBeCallableWith(counting(2), 0, 1);
		expectTypeOf(asView).toBeCallableWith(pointerTo(counting(2), 0), 2);
		expectTypeOf(asView).toBeCallableWith(referenceTo(0));
		expectTypeOf<readonly number[]>().not.toExtend<
			Storage<number> | number[]
		>();
		expectTypeOf<ReadOnlyView<number>>().not.toExtend<
			Storage<number> | number[]
		>();
	});
});
