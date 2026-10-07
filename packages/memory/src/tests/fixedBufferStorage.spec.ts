import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	Decimal,
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { createFixedBufferStorage } from '@/fixedBufferStorage';
import type { Storage } from '@/storage';

import { coded } from './coded';

/**
 * Behaviour suite for `createFixedBufferStorage`.
 *
 * What the contract suite cannot say: values are bytes until they are read,
 * the buffer starts zeroed, values sit end to end without disturbing their
 * neighbours, and a value the element type does not recognise is refused.
 */

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

/** Sixteen bytes, seven of them padding: a neighbour written carelessly shows. */
const Sample = struct('Sample', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

describe('createFixedBufferStorage', () => {
	it('should read every position as the zero value before it is set', () => {
		const points: Storage<Point> = createFixedBufferStorage(Point, 3);

		expect(Point.equals(points.get(2), Point.from({ x: 0, y: 0 }))).toBe(true);
	});

	it('should make a new, frozen value on every read', () => {
		const points: Storage<Point> = createFixedBufferStorage(Point, 1);

		points.set(0, Point.from({ x: 1, y: 2 }));

		const first: Point = points.get(0);
		const second: Point = points.get(0);

		expect(first).not.toBe(second);
		expect(Point.equals(first, second)).toBe(true);
		expect(Object.isFrozen(first)).toBe(true);
	});

	it('should hold a copy in bytes, not the value it was given', () => {
		const points: Storage<Point> = createFixedBufferStorage(Point, 1);
		const written: Point = Point.from({ x: 3, y: 4 });

		points.set(0, written);

		expect(points.get(0)).not.toBe(written);
		expect(Point.equals(points.get(0), written)).toBe(true);
	});

	it('should leave both neighbours untouched when one value is written', () => {
		const samples = createFixedBufferStorage(Sample, 3);

		samples.set(0, Sample.from({ value: -1.5, channel: 255 }));
		samples.set(2, Sample.from({ value: 2.25, channel: 7 }));
		samples.set(1, Sample.from({ value: 1e300, channel: 128 }));

		expect(samples.get(0)).toEqual({ value: -1.5, channel: 255 });
		expect(samples.get(1)).toEqual({ value: 1e300, channel: 128 });
		expect(samples.get(2)).toEqual({ value: 2.25, channel: 7 });
	});

	it('should carry the methods of a struct that declares them', () => {
		const Vector = struct(
			'Vector',
			{ x: DoublePrecisionFloat, y: DoublePrecisionFloat },
			{
				length(): number {
					return Math.hypot(this.x, this.y);
				},
			},
		);
		const vectors = createFixedBufferStorage(Vector, 2);

		vectors.set(1, Vector.from({ x: 3, y: 4 }));

		expect(vectors.get(1).length()).toBe(5);
		expect(vectors.get(0).length()).toBe(0);
	});

	it('should hold nested structs and decimals', () => {
		const Price = struct('Price', { amount: Decimal, at: Point });
		const prices = createFixedBufferStorage(Price, 2);
		const price = Price.from({
			amount: Decimal.from('19.99'),
			at: Point.from({ x: 1, y: 1 }),
		});

		prices.set(1, price);

		expect(Price.equals(prices.get(1), price)).toBe(true);
	});

	it('should refuse a value its element type does not recognise, writing nothing', () => {
		const points: Storage<Point> = createFixedBufferStorage(Point, 1);
		const impostor = Object.freeze({ x: 0.1, y: 0 }) as unknown as Point;

		points.set(0, Point.from({ x: 5, y: 5 }));

		expect(() => points.set(0, impostor)).toThrowError(
			coded(
				new TypeError(
					'FULCRO7004: FixedBufferStorage.set: the value is not a value of Point.',
				),
				{ operation: 'FixedBufferStorage.set', element: 'Point' },
			),
		);
		expect(points.get(0).x).toBe(5);
	});

	it.each([
		['everything', null],
		['name', { layout: { size: 4 } }],
		['layout.size', { name: 'T' }],
		['layout.size', { name: 'T', layout: { size: 0 } }],
		['layout.size', { name: 'T', layout: { size: 1.5 } }],
		['read', { name: 'T', layout: { size: 4 } }],
		['write', { name: 'T', layout: { size: 4 }, read: (): number => 0 }],
		[
			'is',
			{
				name: 'T',
				layout: { size: 4 },
				read: (): number => 0,
				write: (): void => {},
			},
		],
	])('should refuse an element type missing %s', (missing, element) => {
		expect(() =>
			createFixedBufferStorage(element as unknown as typeof Point, 1),
		).toThrowError(
			coded(
				new TypeError(
					`FULCRO7003: createFixedBufferStorage: expected an element type with a name, layout.size, read, write and is; ${missing} is missing.`,
				),
				{ operation: 'createFixedBufferStorage', missing },
			),
		);
	});

	it('should refuse a numeric type, which carries no byte encoding of its own', () => {
		expect(() =>
			createFixedBufferStorage(
				SinglePrecisionFloat as unknown as typeof Point,
				1,
			),
		).toThrowError(TypeError);
	});

	it('should infer the struct it stores', () => {
		expectTypeOf(createFixedBufferStorage(Point, 1)).toEqualTypeOf<
			Storage<Point>
		>();
		expectTypeOf(createFixedBufferStorage(Point, 1).set)
			.parameter(1)
			.toEqualTypeOf<Point>();
		expectTypeOf<{ x: number; y: number }>().not.toMatchTypeOf<Point>();
		expectTypeOf<typeof SinglePrecisionFloat>().not.toMatchTypeOf<
			Parameters<typeof createFixedBufferStorage>[0]
		>();
	});
});
