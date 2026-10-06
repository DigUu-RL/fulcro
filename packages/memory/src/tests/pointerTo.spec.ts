import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/allocate';
import { createArenaAllocator } from '@/arenaAllocator';
import { asView } from '@/asView';
import { createFixedBufferStorage } from '@/fixedBufferStorage';
import { createManagedStorage } from '@/managedStorage';
import type { MemoryReference } from '@/memoryReference';
import type { Pointer } from '@/pointer';
import { pointerTo } from '@/pointerTo';
import { referenceTo } from '@/referenceTo';
import type { Storage } from '@/storage';

import { coded } from './coded';

/**
 * Behaviour suite for `pointerTo`, and for the `Pointer<T>` it returns.
 *
 * A pointer is a position: it reads and writes its source there, moves
 * without changing, may stand one past the last value, and refuses to read or
 * write anywhere it is not.
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

describe('pointerTo', () => {
	it('should read and write its source at its position', () => {
		const numbers: Storage<number> = counting(4);
		const pointer: Pointer<number> = pointerTo(numbers, 2);

		expect(pointer.index).toBe(2);
		expect(pointer.get()).toBe(2);

		pointer.set(20);

		expect(numbers.get(2)).toBe(20);
	});

	it('should point into an array in place', () => {
		const names: string[] = ['a', 'b'];

		pointerTo(names, 1).set('B');

		expect(names).toEqual(['a', 'B']);
	});

	it('should point into a view, at a position of the view', () => {
		const numbers: Storage<number> = counting(10);

		pointerTo(asView(numbers, 4), 1).set(-1);

		expect(numbers.get(5)).toBe(-1);
	});

	it('should point into a struct storage', () => {
		const points = createFixedBufferStorage(Point, 2);

		pointerTo(points, 1).set(Point.from({ x: 3, y: 4 }));

		expect(points.get(1).x).toBe(3);
	});

	it('should stand one past the last value, and refuse to read or write there', () => {
		const end: Pointer<number> = pointerTo(counting(3), 3);

		expect(end.index).toBe(3);
		expect(() => end.get()).toThrowError(
			coded(
				new RangeError(
					'FULCRO7002: Pointer.get: index 3 is outside a storage of length 3.',
				),
				{ operation: 'Pointer.get', index: 3, length: 3 },
			),
		);
		expect(() => end.set(0)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7002: Pointer.set: index 3 is outside a storage of length 3.',
				),
				{ operation: 'Pointer.set', index: 3, length: 3 },
			),
		);
	});

	it.each([
		[-1, -1],
		[4, 4],
		[1.5, 1.5],
		[Number.NaN, Number.NaN],
		['1', 'string'],
	])('should refuse position %s in 3 values', (index, shown) => {
		expect(() => pointerTo(counting(3), index as number)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7016: pointerTo: position ${shown} is outside 0 to 3, where a pointer into 3 values may point.`,
				),
				{ operation: 'pointerTo', index: shown, length: 3 },
			),
		);
	});

	it('should refuse a pointer or a reference as its source', () => {
		const expected = coded(
			new TypeError(
				'FULCRO7017: pointerTo: expected a storage, a view or an array, received a pointer or a memory reference.',
			),
			{
				operation: 'pointerTo',
				expected: 'a storage, a view or an array',
				received: 'a pointer or a memory reference',
			},
		);

		expect(() =>
			pointerTo(pointerTo(counting(2), 0) as unknown as Storage<number>, 0),
		).toThrowError(expected);
		expect(() =>
			pointerTo(referenceTo(0) as unknown as Storage<number>, 0),
		).toThrowError(expected);
	});

	it('should refuse to read once the allocator released its memory', () => {
		const arena = createArenaAllocator(64);
		const pointer: Pointer<Point> = pointerTo(allocate(Point, 2, arena), 1);

		arena.reset();

		expect(() => pointer.get()).toThrowError(
			coded(
				new Error(
					'FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'Storage.get' },
			),
		);
	});

	it('should be frozen, its methods working taken off it', () => {
		const pointer: Pointer<number> = pointerTo(counting(3), 0);
		const { get, set, offset } = pointer;

		set(5);

		expect(Object.isFrozen(pointer)).toBe(true);
		expect(get()).toBe(5);
		expect(offset(2).get()).toBe(2);
	});
});

describe('Pointer.offset', () => {
	it('should move forward and back, leaving the pointer it came from', () => {
		const start: Pointer<number> = pointerTo(counting(5), 1);
		const later: Pointer<number> = start.offset(3);

		expect(later.index).toBe(4);
		expect(later.get()).toBe(4);
		expect(later.offset(-4).get()).toBe(0);
		expect(start.index).toBe(1);
	});

	it('should step onto the end, as a loop does', () => {
		const numbers: Storage<number> = counting(4);
		let sum = 0;

		for (
			let cursor: Pointer<number> = pointerTo(numbers, 0);
			cursor.index < numbers.length;
			cursor = cursor.offset(1)
		) {
			sum += cursor.get();
		}

		expect(sum).toBe(6);
	});

	it.each([
		[-3, -1],
		[2, 4],
		[0.5, 2.5],
	])(
		'should refuse a move of %s from position 2 in 3 values',
		(delta, shown) => {
			expect(() => pointerTo(counting(3), 2).offset(delta)).toThrowError(
				coded(
					new RangeError(
						`FULCRO7016: Pointer.offset: position ${shown} is outside 0 to 3, where a pointer into 3 values may point.`,
					),
					{ operation: 'Pointer.offset', index: shown, length: 3 },
				),
			);
		},
	);

	it('should describe a move that is not a number', () => {
		expect(() =>
			pointerTo(counting(3), 0).offset(null as unknown as number),
		).toThrowError(
			expect.objectContaining({
				code: 'FULCRO7016',
				details: { operation: 'Pointer.offset', index: 'null', length: 3 },
			}),
		);
	});
});

describe('pointerTo types', () => {
	it('should infer the type of the values, and be a memory reference', () => {
		expectTypeOf(pointerTo(counting(1), 0)).toEqualTypeOf<Pointer<number>>();
		expectTypeOf(pointerTo(['a'], 0)).toEqualTypeOf<Pointer<string>>();
		expectTypeOf(pointerTo(counting(1), 0).offset(0)).toEqualTypeOf<
			Pointer<number>
		>();
		expectTypeOf<Pointer<number>>().toExtend<MemoryReference<number>>();
	});
});
