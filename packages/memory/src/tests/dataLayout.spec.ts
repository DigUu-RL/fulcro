import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/src/allocate';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { storedLayoutOf } from '@/src/dataLayout';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import { createManagedAllocator } from '@/src/managedAllocator';
import { createManagedStorage } from '@/src/managedStorage';
import type { Storage } from '@/src/storage';
import { StructureOfArrays } from '@/src/structureOfArrays';
import type { AlignedElement } from '@/src/element';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for the layout a storage is made in: which values are a
 * layout, what a storage remembers of the one it was made in — what a tool
 * inspecting memory reads — and the element types whose fields cannot be
 * laid out.
 */

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
});

/** A layout written outside the package, with the name of one of its own. */
const forgedLayout = Object.freeze({ name: 'StructureOfArrays' });

/**
 * An element type written outside the package, whose layout places its
 * fields as the test needs.
 *
 * @param fields Where each field sits.
 * @returns The element type, eight bytes, of float fields.
 */
const elementWithFields = (fields: Record<string, unknown>): AlignedElement<number> => {
	// Typed apart, as a struct's layout is a wider object than the element
	// contract states.
	const layout: AlignedElement<number>['layout'] & { readonly fields: unknown } = {
		size: 8,
		alignment: 4,
		fields,
	};

	return {
		name: 'Interdictor',
		layout,
		read: (): number => 0,
		write: (): void => undefined,
		is: (value: unknown): value is number => typeof value === 'number',
	};
};

describe('the layout of a storage', () => {
	it('should refuse a layout this package did not make in the type checker too', () => {
		type FixedBufferLayout = Parameters<typeof createFixedBufferStorage>[2];
		type AllocateLayout = Parameters<typeof allocate>[3];

		// An object with the name of a layout is not one: the type carries a mark
		// only this package's values have.
		expectTypeOf<{ readonly name: string }>().not.toExtend<NonNullable<FixedBufferLayout>>();
		expectTypeOf<typeof forgedLayout>().not.toExtend<NonNullable<AllocateLayout>>();

		expectTypeOf(StructureOfArrays).toExtend<NonNullable<FixedBufferLayout>>();
		expectTypeOf(ArrayOfStructures).toExtend<NonNullable<AllocateLayout>>();

		// Optional, so every call written before the layout existed still compiles.
		expectTypeOf<undefined>().toExtend<FixedBufferLayout>();
		expectTypeOf<undefined>().toExtend<AllocateLayout>();
	});

	it('should infer the same storage whichever layout is named, or none', () => {
		type Starfighter = Struct<typeof Starfighter>;

		expectTypeOf(createFixedBufferStorage(Starfighter, 1)).toEqualTypeOf<Storage<Starfighter>>();

		expectTypeOf(createFixedBufferStorage(Starfighter, 1, StructureOfArrays)).toEqualTypeOf<
			Storage<Starfighter>
		>();

		expectTypeOf(
			allocate(Starfighter, 1, createManagedAllocator(), ArrayOfStructures),
		).toEqualTypeOf<Storage<Starfighter>>();
	});

	it('should refuse a layout this package did not make, whatever its name', () => {
		for (const received of [forgedLayout, 'StructureOfArrays', null]) {
			expect(() => createFixedBufferStorage(Starfighter, 2, received as never)).toThrow(TypeError);
		}

		expect(() => allocate(Starfighter, 2, createManagedAllocator(), forgedLayout as never)).toThrow(
			coded(
				new TypeError(
					"FULCRO7031: allocate: expected ArrayOfStructures or StructureOfArrays as the layout, received an object named 'StructureOfArrays'.",
				),
				{ operation: 'allocate', received: "an object named 'StructureOfArrays'" },
			),
		);
	});

	it('should be remembered by the storage, for what inspects it', () => {
		const columns = createFixedBufferStorage(Starfighter, 3, StructureOfArrays);
		const rows = allocate(Starfighter, 3, createManagedAllocator());

		expect(storedLayoutOf(columns)?.layout).toBe(StructureOfArrays);
		expect(storedLayoutOf(rows)?.layout).toBe(ArrayOfStructures);

		expect(storedLayoutOf(columns)?.fields).toEqual([
			{ key: 'shields', offset: 0, size: 4 },
			{ key: 'hull', offset: 4, size: 4 },
		]);

		expect(storedLayoutOf(createManagedStorage(1, 0))).toBeUndefined();
	});

	it('should refuse fields that overlap, run past the value, or are not counts', () => {
		const cases: [Record<string, unknown>, string][] = [
			[{ hull: { offset: 0, size: 4 }, shields: { offset: 2, size: 4 } }, 'shields'],
			[{ hull: { offset: 6, size: 4 } }, 'hull'],
			[{ hull: { offset: -1, size: 4 } }, 'hull'],
			[{ hull: null }, 'hull'],
		];

		for (const [fields, field] of cases) {
			expect(() => {
				createFixedBufferStorage(elementWithFields(fields), 2, StructureOfArrays);
			}).toThrow(
				coded(
					new TypeError(
						`FULCRO7032: createFixedBufferStorage: the layout of Interdictor places its field '${field}' where it cannot be stored; expected an offset and a size, inside the value, after the field before it, and the size of the field's type.`,
					),
					{ operation: 'createFixedBufferStorage', element: 'Interdictor', field },
				),
			);
		}
	});
});
