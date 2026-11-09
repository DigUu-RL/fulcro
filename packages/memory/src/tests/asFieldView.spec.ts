import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	Decimal,
	HalfPrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/src/allocate';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { asFieldView } from '@/src/asFieldView';
import { asView } from '@/src/asView';
import { createArenaAllocator } from '@/src/arenaAllocator';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import { createManagedStorage } from '@/src/managedStorage';
import type { Storage } from '@/src/storage';
import { StructureOfArrays } from '@/src/structureOfArrays';
import { coded } from '@/src/tests/coded';
import type { ReadOnlyView, View } from '@/src/view';

/**
 * Behaviour suite for `asFieldView`.
 *
 * The view reads and writes one field of every value, in place, over either
 * layout; every case runs over both, since what the layout changes is the
 * cost, and that is `asFieldView.performance.spec.ts`'s to count.
 */

const Hyperdrive = struct('Hyperdrive', {
	rating: HalfPrecisionFloat,
	serial: UnsignedInteger(16),
});

const Starfighter = struct(
	'Starfighter',
	{
		shields: SinglePrecisionFloat,
		hull: SinglePrecisionFloat,
		bounty: Decimal,
		hyperdrive: Hyperdrive,
		pilots: UnsignedInteger(8),
	},
	{
		isCrippled(): boolean {
			return this.hull < 0.25;
		},
	},
);

type Starfighter = Struct<typeof Starfighter>;

/**
 * A starfighter whose every field depends on its position.
 *
 * @param index Position of the starfighter.
 * @returns The starfighter.
 */
const starfighterAt = (index: number): Starfighter => {
	return Starfighter.from({
		shields: index,
		hull: 0.5 * index,
		bounty: Decimal.from(`${String(index)}.5`),
		hyperdrive: { rating: 1, serial: 0x1138 + index },
		pilots: index % 3,
	});
};

const LENGTH = 8;

/**
 * A storage of `LENGTH` starfighters, each set to `starfighterAt` its index.
 *
 * @param layout The layout to hold them in.
 * @returns The storage.
 */
const squadronIn = (layout: typeof StructureOfArrays): Storage<Starfighter> => {
	const squadron: Storage<Starfighter> = createFixedBufferStorage(Starfighter, LENGTH, layout);

	for (let index = 0; index < LENGTH; index++) squadron.set(index, starfighterAt(index));

	return squadron;
};

describe.each([
	['StructureOfArrays', StructureOfArrays],
	['ArrayOfStructures', ArrayOfStructures],
] as const)('asFieldView, over an %s', (_name, layout) => {
	it('should read the field of every value, as the value has it', () => {
		const squadron: Storage<Starfighter> = squadronIn(layout);
		const hulls: View<SinglePrecisionFloat> = asFieldView(squadron, 'hull');
		const bounties: View<Decimal> = asFieldView(squadron, 'bounty');
		const pilots: View<UnsignedInteger<8>> = asFieldView(squadron, 'pilots');

		expect(hulls.length).toBe(LENGTH);

		for (let index = 0; index < LENGTH; index++) {
			expect(hulls.get(index)).toBe(squadron.get(index).hull);
			expect(bounties.get(index).equals(squadron.get(index).bounty)).toBe(true);
			expect(pilots.get(index)).toBe(squadron.get(index).pilots);
		}
	});

	it('should read a nested struct as one field, of whole values', () => {
		const hyperdrives = asFieldView(squadronIn(layout), 'hyperdrive');

		expect(hyperdrives.get(3)).toEqual({ rating: 1, serial: 0x1138 + 3 });
		expect(Hyperdrive.is(hyperdrives.get(3))).toBe(true);
	});

	it('should write the field in place, and no other', () => {
		const squadron: Storage<Starfighter> = squadronIn(layout);

		asFieldView(squadron, 'hull').set(5, SinglePrecisionFloat.from(0.125));

		expect(squadron.get(5)).toEqual({ ...starfighterAt(5), hull: 0.125 });
		expect(squadron.get(5).isCrippled()).toBe(true);
		expect(squadron.get(4)).toEqual(starfighterAt(4));
		expect(squadron.get(6)).toEqual(starfighterAt(6));
	});

	it('should see what is written to the storage afterwards', () => {
		const squadron: Storage<Starfighter> = squadronIn(layout);
		const shields: View<SinglePrecisionFloat> = asFieldView(squadron, 'shields');

		squadron.set(0, starfighterAt(7));

		expect(shields.get(0)).toBe(7);
	});

	it('should observe a part of the field through subview and readOnly', () => {
		const shields: View<SinglePrecisionFloat> = asFieldView(squadronIn(layout), 'shields');
		const lastThree: ReadOnlyView<SinglePrecisionFloat> = shields.subview(LENGTH - 3).readOnly();

		expect([lastThree.get(0), lastThree.get(1), lastThree.get(2)]).toEqual([5, 6, 7]);
	});

	it('should refuse a value of another type, and an index outside the storage', () => {
		const hulls: View<SinglePrecisionFloat> = asFieldView(squadronIn(layout), 'hull');

		expect(() => {
			hulls.set(0, 'full' as unknown as SinglePrecisionFloat);
		}).toThrow(
			coded(
				new TypeError('FULCRO7004: View.set: the value is not a value of SinglePrecisionFloat.'),
				{
					operation: 'View.set',
					element: 'SinglePrecisionFloat',
				},
			),
		);

		expect(() => hulls.get(LENGTH)).toThrow(
			coded(
				new RangeError(
					`FULCRO7002: View.get: index ${String(LENGTH)} is outside a storage of length ${String(LENGTH)}.`,
				),
				{
					operation: 'View.get',
					index: LENGTH,
					length: LENGTH,
				},
			),
		);
	});

	it('should refuse every access once the memory is released', () => {
		const arena = createArenaAllocator(4096);

		const shields: View<SinglePrecisionFloat> = asFieldView(
			allocate(Starfighter, LENGTH, arena, layout),
			'shields',
		);

		arena.reset();

		expect(() => shields.get(0)).toThrow(
			coded(
				new Error(
					'FULCRO7009: View.get: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'View.get' },
			),
		);
	});
});

describe('asFieldView', () => {
	it('should type the view by the field, and accept only the struct fields', () => {
		const squadron: Storage<Starfighter> = createFixedBufferStorage(Starfighter, 1);

		expectTypeOf(asFieldView(squadron, 'hull')).toEqualTypeOf<View<SinglePrecisionFloat>>();
		expectTypeOf(asFieldView(squadron, 'bounty')).toEqualTypeOf<View<Decimal>>();

		expectTypeOf(asFieldView<Starfighter, 'hyperdrive'>)
			.parameter(1)
			.toEqualTypeOf<'hyperdrive'>();

		expectTypeOf<Parameters<typeof asFieldView<Starfighter, never>>[1]>().toEqualTypeOf<never>();

		expectTypeOf<'isCrippled'>().not.toExtend<
			Parameters<typeof asFieldView<Starfighter, 'hull'>>[1]
		>();
	});

	it('should refuse a storage it did not lay out as bytes', () => {
		const managed = createManagedStorage(2, starfighterAt(0));
		const viewed = asView(createFixedBufferStorage(Starfighter, 4), 1);

		const expected = coded(
			new TypeError(
				'FULCRO7033: asFieldView: expected a storage made by createFixedBufferStorage or allocate, which holds its values as bytes.',
			),
			{ operation: 'asFieldView' },
		);

		expect(() => asFieldView(managed, 'hull')).toThrow(expected);
		expect(() => asFieldView(viewed, 'hull')).toThrow(expected);
	});

	it('should refuse a storage of a type with no fields', () => {
		const thermalReadings = createFixedBufferStorage(SinglePrecisionFloat, 4, StructureOfArrays);

		expect(() => asFieldView(thermalReadings as never, 'value' as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7035: asFieldView: SinglePrecisionFloat declares no fields to view one of; expected a storage of a struct.',
				),
				{ operation: 'asFieldView', element: 'SinglePrecisionFloat' },
			),
		);
	});

	it('should refuse a field the struct does not declare, naming the ones it does', () => {
		const squadron: Storage<Starfighter> = createFixedBufferStorage(Starfighter, 1);

		expect(() => asFieldView(squadron, 'isCrippled' as never)).toThrow(
			coded(
				new TypeError(
					"FULCRO7034: asFieldView: Starfighter has no field 'isCrippled'; its fields are shields, hull, bounty, hyperdrive, pilots.",
				),
				{
					operation: 'asFieldView',
					element: 'Starfighter',
					field: 'isCrippled',
					fields: 'shields, hull, bounty, hyperdrive, pilots',
				},
			),
		);
	});
});
