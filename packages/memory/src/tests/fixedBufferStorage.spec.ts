import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	BigInteger,
	Decimal,
	DoublePrecisionFloat,
	Fraction,
	SignedInteger,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { Storage } from '@/src/storage';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for `createFixedBufferStorage`.
 *
 * What the contract suite cannot say: values are bytes until they are read,
 * the buffer starts zeroed, values sit end to end without disturbing their
 * neighbours, and a value the element type does not recognise is refused.
 */

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});

type SensorContact = Struct<typeof SensorContact>;

/** Sixteen bytes, seven of them padding: a neighbour written carelessly shows. */
const ScannerReading = struct('ScannerReading', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

describe('createFixedBufferStorage', () => {
	it('should read every position as the zero value before it is set', () => {
		const points: Storage<SensorContact> = createFixedBufferStorage(SensorContact, 3);

		expect(SensorContact.equals(points.get(2), SensorContact.from({ bearing: 0, range: 0 }))).toBe(
			true,
		);
	});

	it('should make a new, frozen value on every read', () => {
		const points: Storage<SensorContact> = createFixedBufferStorage(SensorContact, 1);

		points.set(0, SensorContact.from({ bearing: 1, range: 2 }));

		const first: SensorContact = points.get(0);
		const second: SensorContact = points.get(0);

		expect(first).not.toBe(second);
		expect(SensorContact.equals(first, second)).toBe(true);
		expect(Object.isFrozen(first)).toBe(true);
	});

	it('should hold a copy in bytes, not the value it was given', () => {
		const points: Storage<SensorContact> = createFixedBufferStorage(SensorContact, 1);
		const written: SensorContact = SensorContact.from({ bearing: 3, range: 4 });

		points.set(0, written);

		expect(points.get(0)).not.toBe(written);
		expect(SensorContact.equals(points.get(0), written)).toBe(true);
	});

	it('should leave both neighbours untouched when one value is written', () => {
		const scans = createFixedBufferStorage(ScannerReading, 3);

		scans.set(0, ScannerReading.from({ value: -1.5, channel: 255 }));
		scans.set(2, ScannerReading.from({ value: 2.25, channel: 7 }));
		scans.set(1, ScannerReading.from({ value: 1e300, channel: 128 }));

		expect(scans.get(0)).toEqual({ value: -1.5, channel: 255 });
		expect(scans.get(1)).toEqual({ value: 1e300, channel: 128 });
		expect(scans.get(2)).toEqual({ value: 2.25, channel: 7 });
	});

	it('should carry the methods of a struct that declares them', () => {
		const Vector = struct(
			'Vector',
			{ bearing: DoublePrecisionFloat, range: DoublePrecisionFloat },
			{
				length(): number {
					return Math.hypot(this.bearing, this.range);
				},
			},
		);

		const vectors = createFixedBufferStorage(Vector, 2);

		vectors.set(1, Vector.from({ bearing: 3, range: 4 }));

		expect(vectors.get(1).length()).toBe(5);
		expect(vectors.get(0).length()).toBe(0);
	});

	it('should hold nested structs and decimals', () => {
		const Bounty = struct('Bounty', { credits: Decimal, at: SensorContact });
		const bounties = createFixedBufferStorage(Bounty, 2);

		const bounty = Bounty.from({
			credits: Decimal.from('19.99'),
			at: SensorContact.from({ bearing: 1, range: 1 }),
		});

		bounties.set(1, bounty);

		expect(Bounty.equals(bounties.get(1), bounty)).toBe(true);
	});

	it('should refuse a value its element type does not recognise, writing nothing', () => {
		const points: Storage<SensorContact> = createFixedBufferStorage(SensorContact, 1);
		const impostor = Object.freeze({ bearing: 0.1, range: 0 }) as unknown as SensorContact;

		points.set(0, SensorContact.from({ bearing: 5, range: 5 }));

		expect(() => {
			points.set(0, impostor);
		}).toThrow(
			coded(
				new TypeError(
					'FULCRO7004: FixedBufferStorage.set: the value is not a value of SensorContact.',
				),
				{ operation: 'FixedBufferStorage.set', element: 'SensorContact' },
			),
		);

		expect(points.get(0).bearing).toBe(5);
	});

	it.each([
		['everything', null],
		['everything', 'SensorContact'],
		// A class is read for its members, as `Decimal` is: one without a layout
		// lacks that, not everything.
		[
			'layout.size',
			class Plain {
				readonly value = 0;
			},
		],
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
				write: (): void => {
					// Present only so that is is the one member missing.
				},
			},
		],
	])('should refuse an element type missing %s', (missing, element) => {
		expect(() => createFixedBufferStorage(element as unknown as typeof SensorContact, 1)).toThrow(
			coded(
				new TypeError(
					`FULCRO7003: createFixedBufferStorage: expected an element type with a name, layout.size, read, write and is; ${missing} is missing.`,
				),
				{ operation: 'createFixedBufferStorage', missing },
			),
		);
	});

	it('should hold a numeric type alone, end to end, and give back the value it was handed', () => {
		const weights: Storage<SinglePrecisionFloat> = createFixedBufferStorage(
			SinglePrecisionFloat,
			3,
		);

		const counts = createFixedBufferStorage(UnsignedInteger(64), 2);

		weights.set(1, SinglePrecisionFloat.from(0.1));
		counts.set(1, UnsignedInteger(64).maximum);

		expect([weights.get(0), weights.get(1), weights.get(2)]).toEqual([
			0,
			SinglePrecisionFloat.from(0.1),
			0,
		]);

		expect(counts.get(1)).toBe(2n ** 64n - 1n);
	});

	it.each([
		['BigInteger', BigInteger],
		['Fraction<SignedInteger<32>>', Fraction(SignedInteger(32))],
	])('should refuse %s, whose values have no fixed size', (_name, type) => {
		expect(() => createFixedBufferStorage(type as unknown as typeof SensorContact, 1)).toThrow(
			coded(
				new TypeError(
					'FULCRO7003: createFixedBufferStorage: expected an element type with a name, layout.size, read, write and is; layout.size is missing.',
				),
				{ operation: 'createFixedBufferStorage', missing: 'layout.size' },
			),
		);
	});

	it('should refuse a number outside the numeric type, writing nothing', () => {
		const weights = createFixedBufferStorage(SinglePrecisionFloat, 1);

		expect(() => {
			weights.set(0, 0.1 as SinglePrecisionFloat);
		}).toThrow(
			coded(
				new TypeError(
					'FULCRO7004: FixedBufferStorage.set: the value is not a value of SinglePrecisionFloat.',
				),
				{ operation: 'FixedBufferStorage.set', element: 'SinglePrecisionFloat' },
			),
		);

		expect(weights.get(0)).toBe(0);
	});

	it('should infer the struct it stores', () => {
		expectTypeOf(createFixedBufferStorage(SensorContact, 1)).toEqualTypeOf<
			Storage<SensorContact>
		>();

		expectTypeOf(createFixedBufferStorage(SensorContact, 1))
			.toHaveProperty('set')
			.parameter(1)
			.toEqualTypeOf<SensorContact>();

		expectTypeOf<{ bearing: number; range: number }>().not.toExtend<SensorContact>();

		expectTypeOf(createFixedBufferStorage(SinglePrecisionFloat, 1)).toEqualTypeOf<
			Storage<SinglePrecisionFloat>
		>();

		expectTypeOf(createFixedBufferStorage(Decimal, 1)).toEqualTypeOf<Storage<Decimal>>();
	});
});
