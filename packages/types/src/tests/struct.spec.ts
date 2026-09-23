import { describe, expect, expectTypeOf, it } from 'vitest';

import { BigInteger } from '@/bigInteger';
import { Decimal } from '@/decimal';
import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { HalfPrecisionFloat } from '@/halfPrecisionFloat';
import type { Layout } from '@/layout';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { type Struct, struct } from '@/struct';
import { UnsignedInteger } from '@/unsignedInteger';

/**
 * Behaviour suite for `struct`.
 *
 * Three things are asserted here: the layout, which has to be the same number
 * whether the type checker or the runtime computes it; the value semantics —
 * frozen, compared by field, no identity; and the bytes, which have to read
 * back as the value that was written, for every type a field can have.
 */

const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});
type Vector3 = Struct<typeof Vector3>;

/** Declared smallest first, so that placement by alignment has to reorder it. */
const Mixed = struct('Mixed', {
	flag: UnsignedInteger(8),
	weight: DoublePrecisionFloat,
	count: UnsignedInteger(16),
});

const Inner = struct('Inner', { flag: UnsignedInteger(8) });
const Outer = struct('Outer', { inner: Inner, ratio: SinglePrecisionFloat });

const Wide = struct('Wide', {
	tag: UnsignedInteger(8),
	identifier: UnsignedInteger(128),
});

/** Eight decimals: 128 bytes. */
const Chunk = struct('Chunk', {
	a: Decimal,
	b: Decimal,
	c: Decimal,
	d: Decimal,
	e: Decimal,
	f: Decimal,
	g: Decimal,
	h: Decimal,
});

/** Eight chunks: 1,024 bytes, past what counting a tuple could reach. */
const Block = struct('Block', {
	a: Chunk,
	b: Chunk,
	c: Chunk,
	d: Chunk,
	e: Chunk,
	f: Chunk,
	g: Chunk,
	h: Chunk,
});

/** A block and one byte, padded up to the block's alignment of 16. */
const Large = struct('Large', { block: Block, tail: UnsignedInteger(8) });

/** One field of every type a field can have. */
const Everything = struct('Everything', {
	signed8: SignedInteger(8),
	signed16: SignedInteger(16),
	signed32: SignedInteger(32),
	signed64: SignedInteger(64),
	signed128: SignedInteger(128),
	unsigned8: UnsignedInteger(8),
	unsigned16: UnsignedInteger(16),
	unsigned32: UnsignedInteger(32),
	unsigned64: UnsignedInteger(64),
	unsigned128: UnsignedInteger(128),
	half: HalfPrecisionFloat,
	single: SinglePrecisionFloat,
	double: DoublePrecisionFloat,
	decimal: Decimal,
});

/**
 * Writes a value into a fresh buffer and reads it back.
 *
 * @param descriptor Struct to round-trip through.
 * @param value Value to write.
 * @returns What was read.
 */
const roundTrip = <T>(
	descriptor: {
		readonly layout: { readonly size: number };
		write(view: DataView, offset: number, value: T): void;
		read(view: DataView, offset: number): T;
	},
	value: T,
): T => {
	const view = new DataView(new ArrayBuffer(descriptor.layout.size + 8));

	descriptor.write(view, 8, value);

	return descriptor.read(view, 8);
};

describe('struct', () => {
	describe('layout', () => {
		it('should declare the same layout in its type as it computes at runtime', () => {
			expectTypeOf<Vector3['~layout']>().toEqualTypeOf<{
				readonly size: 12;
				readonly alignment: 4;
			}>();
			expectTypeOf<Struct<typeof Mixed>['~layout']>().toEqualTypeOf<{
				readonly size: 16;
				readonly alignment: 8;
			}>();
			expectTypeOf<Struct<typeof Outer>['~layout']>().toEqualTypeOf<{
				readonly size: 8;
				readonly alignment: 4;
			}>();
			expectTypeOf<Struct<typeof Wide>['~layout']>().toEqualTypeOf<{
				readonly size: 32;
				readonly alignment: 16;
			}>();
			expectTypeOf<Struct<typeof Large>['~layout']>().toEqualTypeOf<{
				readonly size: 1040;
				readonly alignment: 16;
			}>();

			expect([Vector3.layout.size, Vector3.layout.alignment]).toEqual([12, 4]);
			expect([Mixed.layout.size, Mixed.layout.alignment]).toEqual([16, 8]);
			expect([Outer.layout.size, Outer.layout.alignment]).toEqual([8, 4]);
			expect([Wide.layout.size, Wide.layout.alignment]).toEqual([32, 16]);
			expect([Large.layout.size, Large.layout.alignment]).toEqual([1040, 16]);
		});

		it('should place fields by alignment, largest first, and in declaration order among equals', () => {
			expect(Mixed.layout.fields).toEqual({
				flag: { offset: 10, size: 1, alignment: 1 },
				weight: { offset: 0, size: 8, alignment: 8 },
				count: { offset: 8, size: 2, alignment: 2 },
			});
			expect(Vector3.layout.fields.x.offset).toBe(0);
			expect(Vector3.layout.fields.y.offset).toBe(4);
			expect(Vector3.layout.fields.z.offset).toBe(8);
		});

		it('should lay a nested struct out inline, as one field of its own size', () => {
			expect(Outer.layout.fields.inner).toEqual({
				offset: 4,
				size: 1,
				alignment: 1,
			});
		});

		it('should freeze the layout', () => {
			expect(Object.isFrozen(Mixed.layout)).toBe(true);
			expect(Object.isFrozen(Mixed.layout.fields)).toBe(true);
			expect(Object.isFrozen(Mixed.layout.fields.flag)).toBe(true);
		});
	});

	describe('declaration', () => {
		it('should accept only types with a fixed layout, in the type checker', () => {
			type Fields = Parameters<typeof struct>[1];

			expectTypeOf<{ value: typeof Decimal }>().toMatchTypeOf<Fields>();
			expectTypeOf<{ value: typeof Vector3 }>().toMatchTypeOf<Fields>();
			expectTypeOf<{ value: typeof BigInteger }>().not.toMatchTypeOf<Fields>();
		});

		it('should refuse a field with no fixed layout at runtime too', () => {
			expect(() =>
				struct('Account', { balance: BigInteger } as never),
			).toThrowError(
				new TypeError(
					"struct Account: field 'balance' has no fixed layout. Declare it with a numeric type of @fulcro/types other than BigInteger, or with another struct.",
				),
			);
			expect(() =>
				struct('Loose', { value: { is: () => true } } as never),
			).toThrow(TypeError);
		});

		it('should refuse no fields, no name, and names an object would reorder', () => {
			expect(() => struct('Empty', {})).toThrowError(
				new TypeError('struct Empty: expected at least one field.'),
			);
			expect(() => struct('', { x: SinglePrecisionFloat })).toThrow(TypeError);
			expect(() => struct('Indexed', { 0: SinglePrecisionFloat })).toThrow(
				TypeError,
			);
			expect(() =>
				struct('Layout', { '~layout': SinglePrecisionFloat }),
			).toThrow(TypeError);
		});

		it('should recognise an integer descriptor by identity, not by shape', () => {
			const lookalike = { ...SignedInteger(32) };

			expect(() => struct('Fake', { value: lookalike })).toThrow(TypeError);
		});
	});

	describe('values', () => {
		it('should convert each field with its own type, into a frozen value', () => {
			const value: Vector3 = Vector3.from({ x: 0.1, y: 1, z: -2 });

			expect(value).toEqual({ x: 0.10000000149011612, y: 1, z: -2 });
			expect(Object.isFrozen(value)).toBe(true);
			expect(Object.keys(value)).toEqual(['x', 'y', 'z']);
			expectTypeOf(value.x).toEqualTypeOf<SinglePrecisionFloat>();
		});

		it('should accept a value already of the struct, and nest', () => {
			const inner = Inner.from({ flag: 7 });
			const outer = Outer.from({ inner, ratio: 0.5 });

			expect(outer.inner).toEqual(inner);
			expect(Object.isFrozen(outer.inner)).toBe(true);
		});

		it('should name the field whose conversion failed, and keep the original as the cause', () => {
			let caught: unknown;

			try {
				Mixed.from({ flag: 256, weight: 1, count: 1 });
			} catch (error) {
				caught = error;
			}

			expect(caught).toBeInstanceOf(RangeError);
			expect((caught as Error).message).toBe(
				"Mixed.from: field 'flag': UnsignedInteger<8>.from: 256 is outside [0, 255].",
			);
			expect((caught as Error).cause).toBeInstanceOf(RangeError);
		});

		it('should refuse a missing field, an unknown one, and a non-object', () => {
			expect(() => Vector3.from({ x: 1, y: 2 } as never)).toThrowError(
				new TypeError("Vector3.from: missing field 'z'."),
			);
			expect(() =>
				Vector3.from({ x: 1, y: 2, z: 3, w: 4 } as never),
			).toThrowError(
				new TypeError(
					"Vector3.from: 'w' is not a field; the fields are x, y, z.",
				),
			);
			expect(() => Vector3.from(null as never)).toThrowError(
				new TypeError('Vector3.from: expected an object, received null.'),
			);
		});

		it('should recognise its own values only', () => {
			const value = Vector3.from({ x: 1, y: 2, z: 3 });

			expect(Vector3.is(value)).toBe(true);
			expect(Vector3.is({ ...value })).toBe(false);
			expect(Vector3.is(Object.freeze({ ...value, w: 4 }))).toBe(false);
			expect(Vector3.is(Object.freeze({ x: 1, y: 2, z: 0.1 }))).toBe(false);
			expect(Vector3.is(null)).toBe(false);
			expect(Vector3.is(Inner.from({ flag: 1 }))).toBe(false);
		});

		it('should compare by field, as each field type compares', () => {
			const a = Vector3.from({ x: 1, y: 2, z: 3 });
			const b = Vector3.from({ x: 1, y: 2, z: 3 });

			expect(a === b).toBe(false);
			expect(Vector3.equals(a, b)).toBe(true);
			expect(Vector3.equals(a, Vector3.from({ x: 1, y: 2, z: 4 }))).toBe(false);
			expect(
				Vector3.equals(
					Vector3.from({ x: 0, y: 0, z: 0 }),
					Vector3.from({ x: -0, y: 0, z: 0 }),
				),
			).toBe(true);

			const withNaN = Vector3.from({ x: NaN, y: 0, z: 0 });

			expect(Vector3.equals(withNaN, withNaN)).toBe(false);
		});

		it('should compare decimals and nested structs by value', () => {
			const Price = struct('Price', { amount: Decimal, inner: Inner });

			expect(
				Price.equals(
					Price.from({ amount: '1.50', inner: { flag: 1 } }),
					Price.from({ amount: '1.5', inner: { flag: 1 } }),
				),
			).toBe(true);
		});
	});

	describe('methods', () => {
		const Point = struct(
			'Point',
			{ x: SinglePrecisionFloat, y: SinglePrecisionFloat },
			{
				length() {
					return Math.hypot(this.x, this.y);
				},
				scale(factor: number): { x: number; y: number } {
					return { x: this.x * factor, y: this.y * factor };
				},
			},
		);
		type Point = Struct<typeof Point>;

		it('should give every value its methods, with this as the value', () => {
			const point: Point = Point.from({ x: 3, y: 4 });

			expect(point.length()).toBe(5);
			expect(point.scale(2)).toEqual({ x: 6, y: 8 });
			expectTypeOf(point.length).toEqualTypeOf<() => number>();
			expectTypeOf<Point['x']>().toEqualTypeOf<SinglePrecisionFloat>();
		});

		it('should give the values read from bytes their methods too', () => {
			const read = roundTrip(Point, Point.from({ x: 3, y: 4 }));

			expect(read.length()).toBe(5);
			expect(Point.is(read)).toBe(true);
		});

		it('should keep a nested struct its own methods', () => {
			const Segment = struct('Segment', { start: Point, end: Point });
			const segment = Segment.from({
				start: { x: 0, y: 0 },
				end: { x: 3, y: 4 },
			});

			expect(segment.end.length()).toBe(5);
			expect(roundTrip(Segment, segment).end.length()).toBe(5);
		});

		it('should share one prototype, and keep only the fields as own keys', () => {
			const a = Point.from({ x: 1, y: 2 });
			const b = Point.from({ x: 3, y: 4 });

			expect(Object.getPrototypeOf(a)).toBe(Object.getPrototypeOf(b));
			expect(Object.keys(a)).toEqual(['x', 'y']);
			expect({ ...a }).toEqual({ x: 1, y: 2 });
			expect(Object.isFrozen(Object.getPrototypeOf(a))).toBe(true);
		});

		it('should leave the layout, equality and bytes as the fields alone make them', () => {
			const Plain = struct('Plain', {
				x: SinglePrecisionFloat,
				y: SinglePrecisionFloat,
			});

			expect(Point.layout).toEqual(Plain.layout);
			expectTypeOf<Point['~layout']>().toEqualTypeOf<
				Struct<typeof Plain>['~layout']
			>();
			expect(
				Point.equals(Point.from({ x: 1, y: 2 }), Point.from({ x: 1, y: 2 })),
			).toBe(true);
		});

		it('should refuse an object with the right fields but not made by the struct', () => {
			expect(Point.is(Object.freeze({ x: 3, y: 4 }))).toBe(false);
			expect(Point.is(Object.freeze({ ...Point.from({ x: 3, y: 4 }) }))).toBe(
				false,
			);
		});

		it('should keep is as it was for a struct without methods', () => {
			expect(Vector3.is(Object.freeze({ x: 1, y: 2, z: 3 }))).toBe(true);
		});

		it('should infer a struct without methods exactly as before', () => {
			expectTypeOf<Vector3>().toEqualTypeOf<
				{
					readonly x: SinglePrecisionFloat;
					readonly y: SinglePrecisionFloat;
					readonly z: SinglePrecisionFloat;
				} & Layout<12, 4>
			>();
			expect(Object.getPrototypeOf(Vector3.from({ x: 1, y: 2, z: 3 }))).toBe(
				Object.prototype,
			);
		});

		it('should not let a method change the value', () => {
			const point = Point.from({ x: 1, y: 2 });
			const Mutating = struct(
				'Mutating',
				{ x: SinglePrecisionFloat },
				{
					reset() {
						(this as { x: number }).x = 0;
					},
				},
			);

			expect(() => Mutating.from({ x: 1 }).reset()).toThrow(TypeError);
			expect(() => {
				(point as { length: unknown }).length = null;
			}).toThrow(TypeError);
		});

		it('should refuse a method named like a field, an index or the layout', () => {
			expect(() =>
				struct('Clash', { x: SinglePrecisionFloat }, { x: () => 1 } as never),
			).toThrowError(
				new TypeError(
					"struct Clash: method 'x' has the name of a field; a value could not hold both.",
				),
			);
			expect(() =>
				struct('Indexed', { x: SinglePrecisionFloat }, { 0: () => 1 }),
			).toThrow(TypeError);
			expect(() =>
				struct('Layout', { x: SinglePrecisionFloat }, { '~layout': () => 1 }),
			).toThrow(TypeError);
		});

		it('should refuse a method that is not a function, and methods that are not an object', () => {
			expect(() =>
				struct('Loose', { x: SinglePrecisionFloat }, { size: 3 } as never),
			).toThrowError(
				new TypeError(
					"struct Loose: method 'size' must be a function, received number.",
				),
			);
			expect(() =>
				struct('Null', { x: SinglePrecisionFloat }, null as never),
			).toThrowError(
				new TypeError(
					'struct Null: expected an object of methods, received null.',
				),
			);
		});

		it('should lose its methods through a structured clone or JSON, and get them back from from', () => {
			const point = Point.from({ x: 3, y: 4 });
			const cloned: unknown = structuredClone(point);
			const parsed: unknown = JSON.parse(JSON.stringify(point));

			expect(Point.is(cloned)).toBe(false);
			expect(Point.is(parsed)).toBe(false);
			expect(Point.from(cloned as never).length()).toBe(5);
			expect(Point.from(parsed as never).length()).toBe(5);
		});

		it('should let a method return a new value of its own struct', () => {
			const Counter = struct(
				'Counter',
				{ value: UnsignedInteger(32) },
				{
					next() {
						return Counter.from({ value: this.value + 1 });
					},
				},
			);
			type Counter = Struct<typeof Counter>;

			const next: Counter = Counter.from({ value: 1 }).next();

			expectTypeOf(Counter.from({ value: 1 }).next()).not.toBeAny();
			expectTypeOf(next.next().value).toEqualTypeOf<UnsignedInteger<32>>();
			expect(next.value).toBe(2);
			expect(Counter.is(next)).toBe(true);
		});

		it('should accept a method keyed by a symbol', () => {
			const Pair = struct(
				'Pair',
				{ left: SinglePrecisionFloat, right: SinglePrecisionFloat },
				{
					*[Symbol.iterator]() {
						yield this.left;
						yield this.right;
					},
				},
			);

			expect([...Pair.from({ left: 1, right: 2 })]).toEqual([1, 2]);
		});
	});

	describe('bytes', () => {
		it('should read back what it wrote, for every type at its extremes', () => {
			const value = Everything.from({
				signed8: -128,
				signed16: 32_767,
				signed32: -2_147_483_648,
				signed64: -(2n ** 63n),
				signed128: -(2n ** 127n),
				unsigned8: 255,
				unsigned16: 65_535,
				unsigned32: 4_294_967_295,
				unsigned64: 2n ** 64n - 1n,
				unsigned128: 2n ** 128n - 1n,
				half: -65_504,
				single: 3.4028234663852886e38,
				double: Number.MIN_VALUE,
				decimal: Decimal.maximum,
			});

			const read = roundTrip(Everything, value);

			expect(read).toEqual(value);
			expect(Everything.equals(read, value)).toBe(true);
			expect(Everything.is(read)).toBe(true);
		});

		it('should read back the upper end of the signed 128-bit range', () => {
			const Holder = struct('Holder', { value: SignedInteger(128) });
			const value = Holder.from({ value: 2n ** 127n - 1n });

			expect(roundTrip(Holder, value)).toEqual(value);
		});

		it('should write every value in little-endian order', () => {
			const Word = struct('Word', { value: UnsignedInteger(32) });
			const bytes = new Uint8Array(4);

			Word.write(
				new DataView(bytes.buffer),
				0,
				Word.from({ value: 0x01020304 }),
			);

			expect([...bytes]).toEqual([4, 3, 2, 1]);
		});

		it('should round-trip every half precision bit pattern', () => {
			const Half = struct('Half', { value: HalfPrecisionFloat });
			const source = new DataView(new ArrayBuffer(2));
			const target = new DataView(new ArrayBuffer(2));
			let mismatches = 0;

			for (let bits = 0; bits <= 0xffff; bits++) {
				source.setUint16(0, bits, true);

				const value = Half.read(source, 0);
				const isNaN: boolean = Number.isNaN(value.value);

				Half.write(target, 0, value);

				if (!HalfPrecisionFloat.is(value.value)) mismatches++;
				if (!isNaN && target.getUint16(0, true) !== bits) mismatches++;
			}

			expect(mismatches).toBe(0);
		});

		it('should store a decimal as decimal128 in its binary integer encoding', () => {
			const Amount = struct('Amount', { value: Decimal });
			const view = new DataView(new ArrayBuffer(16));

			Amount.write(view, 0, Amount.from({ value: 1 }));

			expect(view.getBigUint64(8, true)).toBe(0x3040_0000_0000_0000n);
			expect(view.getBigUint64(0, true)).toBe(1n);
		});

		it.each([
			'0.1',
			'-0',
			'1e6144',
			'1e-6176',
			'9.999999999999999999999999999999999e6144',
			'123456789012345678901234567890.1234',
			'Infinity',
			'-Infinity',
		])('should round-trip the decimal %s', (text) => {
			const Amount = struct('Amount', { value: Decimal });
			const read = roundTrip(Amount, Amount.from({ value: text }));

			expect(read.value.toString()).toBe(Decimal.from(text).toString());
			expect(read.value.isNegative()).toBe(Decimal.from(text).isNegative());
		});

		it('should round-trip a decimal NaN', () => {
			const Amount = struct('Amount', { value: Decimal });

			expect(
				roundTrip(Amount, Amount.from({ value: NaN })).value.toString(),
			).toBe('NaN');
		});

		it('should write a nested struct inline, at its offset in the parent', () => {
			const view = new DataView(new ArrayBuffer(Outer.layout.size));

			Outer.write(view, 0, Outer.from({ inner: { flag: 200 }, ratio: 1 }));

			expect(view.getUint8(Outer.layout.fields.inner.offset)).toBe(200);
			expect(view.getFloat32(Outer.layout.fields.ratio.offset, true)).toBe(1);
		});

		it('should refuse an offset the struct does not fit at, and leave the bytes alone', () => {
			const bytes = new Uint8Array(12);
			const view = new DataView(bytes.buffer);
			const value = Vector3.from({ x: 1, y: 2, z: 3 });

			expect(() => Vector3.write(view, 4, value)).toThrowError(
				new RangeError(
					'Vector3.write: 12 bytes at offset 4 do not fit in a view of 12 bytes.',
				),
			);
			expect([...bytes].every((byte) => byte === 0)).toBe(true);
			expect(() => Vector3.read(view, -1)).toThrow(RangeError);
			expect(() => Vector3.read(view, 0.5)).toThrow(RangeError);
			expect(() => Vector3.read({} as DataView, 0)).toThrow(TypeError);
		});

		it('should leave the padding bytes as they were', () => {
			// Fields end at byte 11 of 16: bytes 11 to 15 are tail padding.
			const bytes = new Uint8Array(Mixed.layout.size).fill(0xaa);

			Mixed.write(
				new DataView(bytes.buffer),
				0,
				Mixed.from({ flag: 0, weight: 0, count: 0 }),
			);

			expect([...bytes.subarray(11)]).toEqual([0xaa, 0xaa, 0xaa, 0xaa, 0xaa]);
			expect([...bytes.subarray(0, 11)].every((byte) => byte === 0)).toBe(true);
		});

		it('should make a new object on every read', () => {
			const view = new DataView(new ArrayBuffer(Vector3.layout.size));

			expect(Vector3.read(view, 0)).not.toBe(Vector3.read(view, 0));
		});

		it('should read at an offset inside a larger buffer', () => {
			const view = new DataView(new ArrayBuffer(Vector3.layout.size * 3));
			const second = Vector3.from({ x: 4, y: 5, z: 6 });

			Vector3.write(view, Vector3.layout.size, second);

			expect(Vector3.read(view, Vector3.layout.size)).toEqual(second);
			expect(Vector3.read(view, 0)).toEqual({ x: 0, y: 0, z: 0 });
		});
	});
});
