import { beforeEach, describe, expect, it } from 'vitest';

import { DoublePrecisionFloat, type Struct, struct, UnsignedInteger } from '@fulcro/types';

import { allocate } from '@/src/allocate';
import type { Allocation, Allocator } from '@/src/allocator';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { Storage } from '@/src/storage';
import { StructureOfArrays } from '@/src/structureOfArrays';

/**
 * Performance suite for `StructureOfArrays`.
 *
 * Counted, never timed (`docs/testing.md`): the element type is wrapped so
 * every read, write and recognition it is asked for is counted. What is
 * asserted is what the layout promises a whole value costs — exactly what it
 * costs in an array of structures, one call of the element per access and no
 * call per field — that nothing is made when the storage is, and that the
 * columns take no more bytes than the fields.
 */

/** Sixteen bytes per value, seven of them padding. */
const ScannerReading = struct('ScannerReading', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

type ScannerReading = Struct<typeof ScannerReading>;

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

let reads = 0;
let writes = 0;
let recognitions = 0;

/** `ScannerReading`, counting what the storage asks of it. */
const counted = {
	name: ScannerReading.name,
	layout: ScannerReading.layout,
	read: (view: DataView, offset: number): ScannerReading => {
		reads++;

		return ScannerReading.read(view, offset);
	},
	write: (view: DataView, offset: number, value: ScannerReading): void => {
		writes++;
		ScannerReading.write(view, offset, value);
	},
	is: (value: unknown): value is ScannerReading => {
		recognitions++;

		return ScannerReading.is(value);
	},
};

const scan: ScannerReading = ScannerReading.from({ value: 1.5, channel: 3 });

beforeEach(() => {
	reads = 0;
	writes = 0;
	recognitions = 0;
});

describe('StructureOfArrays, counted', () => {
	it('should make nothing when it is created, however long', () => {
		createFixedBufferStorage(counted, VOLUME, StructureOfArrays);

		expect([reads, writes, recognitions]).toEqual([0, 0, 0]);
	});

	it('should read once per get and write nothing, as an array of structures does', () => {
		for (const layout of [StructureOfArrays, ArrayOfStructures]) {
			const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME, layout);

			reads = 0;
			scans.get(VOLUME - 1);

			expect([reads, writes, recognitions]).toEqual([1, 0, 0]);
		}
	});

	it('should recognise once and write once per set, and read nothing', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(
			counted,
			VOLUME,
			StructureOfArrays,
		);

		scans.set(VOLUME - 1, scan);

		expect([reads, writes, recognitions]).toEqual([0, 1, 1]);
	});

	it('should cost one call per access across the whole storage, never one per field', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(
			counted,
			VOLUME,
			StructureOfArrays,
		);

		for (let index = 0; index < VOLUME; index++) scans.set(index, scan);
		for (let index = 0; index < VOLUME; index++) scans.get(index);

		expect([reads, writes, recognitions]).toEqual([VOLUME, VOLUME, VOLUME]);
	});

	it('should ask the allocator once, for the fields and no padding', () => {
		const requests: number[] = [];

		const allocator: Allocator = {
			allocate: (size: number): Allocation => {
				requests.push(size);

				return { bytes: new DataView(new ArrayBuffer(size)), isLive: () => true };
			},
		};

		allocate(ScannerReading, VOLUME, allocator, StructureOfArrays);
		allocate(ScannerReading, VOLUME, allocator, ArrayOfStructures);

		// Nine bytes of fields against sixteen with the padding.
		expect(requests).toEqual([VOLUME * 9, VOLUME * 16]);
	});
});
