import { beforeEach, describe, expect, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { asFieldView } from '@/src/asFieldView';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { AlignedElement } from '@/src/element';
import { StructureOfArrays } from '@/src/structureOfArrays';
import type { View } from '@/src/view';

/**
 * Performance suite for `asFieldView`.
 *
 * Counted, never timed (`docs/testing.md`). The field's type is wrapped so
 * every byte offset it is asked to read at is recorded, and the struct's own
 * `read` is counted beside it. What is asserted is what tells the two layouts
 * apart when one field of every value is walked: the bytes touched, counted as
 * the 64-byte lines of memory those offsets fall in, since a processor brings
 * a whole line in to read one byte of it. Counting the bytes read instead
 * would say the two cost the same, which is the one thing they do not.
 */

/** Sixteen bytes, four fields of four: walking one reads a quarter of a value. */
const Starship = struct('Starship', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
	heading: SinglePrecisionFloat,
});

type Starship = Struct<typeof Starship>;

/** Enough starships to fill a thousand lines in an array of structures. */
const FLEET = 4_096;

/** Bytes in one line of memory, the unit a cache brings in. */
const LINE = 64;

let fieldOffsets: number[] = [];
let fieldReads = 0;
let wholeReads = 0;

/**
 * `SinglePrecisionFloat`, recording every offset it is read at.
 *
 * @param encoding The encoding it names: none, to be read through `read` at
 * every step, or `'Float32'`, to be held in a typed array where it can be.
 * @returns The counted field type.
 */
const countedHull = (encoding?: 'Float32'): AlignedElement<SinglePrecisionFloat> => {
	return {
		name: SinglePrecisionFloat.name,
		layout: { size: 4, alignment: 4, ...(encoding === undefined ? {} : { encoding }) },
		read: (view: DataView, offset: number): SinglePrecisionFloat => {
			fieldReads++;
			fieldOffsets.push(offset);

			return SinglePrecisionFloat.read(view, offset);
		},
		write: (view: DataView, offset: number, value: SinglePrecisionFloat): void => {
			SinglePrecisionFloat.write(view, offset, value);
		},
		is: (value: unknown): value is SinglePrecisionFloat => SinglePrecisionFloat.is(value),
	};
};

/**
 * `Starship`, its whole reads counted, with a counted type for its hull.
 *
 * @param hull The hull's type.
 * @returns The element type.
 */
const countedStarship = (
	hull: AlignedElement<SinglePrecisionFloat>,
): AlignedElement<Starship> & { readonly fields: Readonly<Record<string, unknown>> } => {
	return {
		name: Starship.name,
		layout: Starship.layout,
		fields: { ...Starship.fields, hull },
		read: (view: DataView, offset: number): Starship => {
			wholeReads++;

			return Starship.read(view, offset);
		},
		write: (view: DataView, offset: number, value: Starship): void => {
			Starship.write(view, offset, value);
		},
		is: (value: unknown): value is Starship => Starship.is(value),
	};
};

/**
 * How many lines of memory a set of reads touched.
 *
 * @param offsets Where each read started.
 * @param size How many bytes each read.
 * @returns The distinct lines they fall in.
 */
const linesTouched = (offsets: readonly number[], size: number): number => {
	const lines = new Set<number>();

	for (const offset of offsets) {
		for (
			let line = Math.floor(offset / LINE);
			line <= Math.floor((offset + size - 1) / LINE);
			line++
		) {
			lines.add(line);
		}
	}

	return lines.size;
};

/**
 * Walks the hull of every starship of a fleet held in a layout.
 *
 * @param layout The layout of the fleet.
 * @param hull The hull's type.
 * @returns The sum of the hulls, so the walk is not optimised away.
 */
const walkHulls = (
	layout: typeof StructureOfArrays,
	hull: AlignedElement<SinglePrecisionFloat>,
): number => {
	const fleet = createFixedBufferStorage(countedStarship(hull), FLEET, layout);
	const hulls: View<SinglePrecisionFloat> = asFieldView(fleet, 'hull');
	let total = 0;

	fieldOffsets = [];
	fieldReads = 0;
	wholeReads = 0;

	for (let index = 0; index < hulls.length; index++) total += hulls.get(index);

	return total;
};

beforeEach(() => {
	fieldOffsets = [];
	fieldReads = 0;
	wholeReads = 0;
});

describe('asFieldView, counted', () => {
	it('should read nothing when it is made, however long the storage', () => {
		const fleet = createFixedBufferStorage(
			countedStarship(countedHull()),
			FLEET,
			StructureOfArrays,
		);

		asFieldView(fleet, 'hull');

		expect([fieldReads, wholeReads]).toEqual([0, 0]);
	});

	it('should read the field once per get, and never a whole value, in either layout', () => {
		for (const layout of [StructureOfArrays, ArrayOfStructures]) {
			walkHulls(layout, countedHull());

			expect([fieldReads, wholeReads]).toEqual([FLEET, 0]);
		}
	});

	it('should touch a quarter of the lines in a structure of arrays that an array of structures touches', () => {
		walkHulls(StructureOfArrays, countedHull());

		const columnLines: number = linesTouched(fieldOffsets, 4);

		walkHulls(ArrayOfStructures, countedHull());

		const rowLines: number = linesTouched(fieldOffsets, 4);

		// One column of four-byte hulls, end to end: 4,096 × 4 / 64 lines. In
		// rows, every hull sits in the sixteen bytes of its own starship, and four
		// starships share a line: 4,096 × 16 / 64.
		expect(columnLines).toBe((FLEET * 4) / LINE);
		expect(rowLines).toBe((FLEET * Starship.layout.size) / LINE);
		expect(columnLines * LINE).toBe(16_384);
		expect(rowLines * LINE).toBe(65_536);
	});

	it('should read every hull from one contiguous run in a structure of arrays, and at a stride in rows', () => {
		walkHulls(StructureOfArrays, countedHull());

		const column: number[] = fieldOffsets;

		expect(column.every((offset, index) => offset === FLEET * 4 + index * 4)).toBe(true);

		walkHulls(ArrayOfStructures, countedHull());

		expect(fieldOffsets.every((offset, index) => offset === 4 + index * Starship.layout.size)).toBe(
			true,
		);
	});

	it('should hold a column in a typed array, where rows still read each value', () => {
		walkHulls(StructureOfArrays, countedHull('Float32'));

		expect(fieldReads).toBe(0);

		walkHulls(ArrayOfStructures, countedHull('Float32'));

		expect(fieldReads).toBe(FLEET);
	});
});
