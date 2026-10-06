import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/allocate';
import { createFixedBufferStorage } from '@/fixedBufferStorage';
import { createManagedAllocator } from '@/managedAllocator';
import { createManagedStorage } from '@/managedStorage';
import type { Storage } from '@/storage';

import { coded } from './coded';

/**
 * Behaviour suite for the `Storage<T>` contract.
 *
 * The same cases over every strategy: a consumer written against the contract
 * must not be able to tell which one it was handed. What only one strategy
 * does is in that strategy's own suite.
 */

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

const origin: Point = Point.from({ x: 0, y: 0 });

/** Each strategy, as a factory of a storage of points. */
const STRATEGIES = [
	['ManagedStorage', (length: number) => createManagedStorage(length, origin)],
	[
		'FixedBufferStorage',
		(length: number) => createFixedBufferStorage(Point, length),
	],
	// What `allocate` returns names its operations after the contract itself,
	// since no storage strategy of its own stands behind it.
	[
		'Storage',
		(length: number) => allocate(Point, length, createManagedAllocator()),
	],
] as const;

/**
 * A consumer that knows nothing but the contract.
 *
 * @param points Any storage of points.
 * @returns The sum of their `x`.
 */
const sumOfX = (points: Storage<Point>): number => {
	let sum = 0;

	for (let index = 0; index < points.length; index++) {
		sum += points.get(index).x;
	}

	return sum;
};

describe.each(STRATEGIES)('%s, as a Storage<T>', (name, create) => {
	it('should report the length it was created with', () => {
		expect(create(5).length).toBe(5);
		expect(create(0).length).toBe(0);
	});

	it('should read back what was set, at that index only', () => {
		const points: Storage<Point> = create(3);

		points.set(1, Point.from({ x: 2, y: 3 }));

		expect(Point.equals(points.get(1), Point.from({ x: 2, y: 3 }))).toBe(true);
		expect(Point.equals(points.get(0), origin)).toBe(true);
		expect(Point.equals(points.get(2), origin)).toBe(true);
	});

	it('should run a consumer written against the contract', () => {
		const points: Storage<Point> = create(4);

		for (let index = 0; index < points.length; index++) {
			points.set(index, Point.from({ x: index, y: 0 }));
		}

		expect(sumOfX(points)).toBe(0 + 1 + 2 + 3);
	});

	it('should be frozen', () => {
		const points: Storage<Point> = create(1);

		expect(Object.isFrozen(points)).toBe(true);
	});

	it('should work with its methods taken off the object', () => {
		const { get, set } = create(2);

		set(1, Point.from({ x: 7, y: 0 }));

		expect(get(1).x).toBe(7);
	});

	it.each([
		[-1, '-1'],
		[3, '3'],
		[1.5, '1.5'],
		[Number.NaN, 'NaN'],
		[Number.POSITIVE_INFINITY, 'Infinity'],
	])('should refuse to get index %s', (index, shown) => {
		expect(() => create(3).get(index)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7002: ${name}.get: index ${shown} is outside a storage of length 3.`,
				),
				{ operation: `${name}.get`, index, length: 3 },
			),
		);
	});

	it('should refuse to set outside, and leave every value as it was', () => {
		const points: Storage<Point> = create(2);

		expect(() => points.set(2, Point.from({ x: 1, y: 1 }))).toThrowError(
			coded(
				new RangeError(
					`FULCRO7002: ${name}.set: index 2 is outside a storage of length 2.`,
				),
				{ operation: `${name}.set`, index: 2, length: 2 },
			),
		);
		expect(sumOfX(points)).toBe(0);
	});

	it('should hold nothing at length 0', () => {
		expect(() => create(0).get(0)).toThrowError(RangeError);
	});

	it('should infer the type of the values it holds', () => {
		expectTypeOf(create(1)).toEqualTypeOf<Storage<Point>>();
		expectTypeOf(create(1).get(0)).toEqualTypeOf<Point>();
	});
});

describe('Storage<T> lengths', () => {
	it.each([
		[
			'createManagedStorage',
			(length: number) => createManagedStorage(length, 0),
		],
		[
			'createFixedBufferStorage',
			(length: number) => createFixedBufferStorage(Point, length),
		],
		[
			'allocate',
			(length: number) => allocate(Point, length, createManagedAllocator()),
		],
	] as const)(
		'%s should refuse a length that is not a count',
		(name, create) => {
			for (const [length, shown] of [
				[-1, '-1'],
				[1.5, '1.5'],
				[Number.NaN, 'NaN'],
				[2 ** 53, String(2 ** 53)],
			] as const) {
				expect(() => create(length)).toThrowError(
					coded(
						new RangeError(
							`FULCRO7001: ${name}: expected a length that is a non-negative safe integer, received ${shown}.`,
						),
						{ operation: name, received: length },
					),
				);
			}
		},
	);
});
