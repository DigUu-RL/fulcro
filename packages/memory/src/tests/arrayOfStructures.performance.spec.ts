import { beforeEach, describe, expect, it } from 'vitest';

import { DoublePrecisionFloat, type Struct, struct, UnsignedInteger } from '@fulcro/types';

import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { Storage } from '@/src/storage';

/**
 * Performance suite for `ArrayOfStructures`.
 *
 * Counted, never timed (`docs/testing.md`): the element type is wrapped so
 * every read and write it is asked for is counted, with the offset it was
 * asked at. What is asserted is that a whole value is one call at one offset —
 * its bytes are one run — and that naming the layout costs exactly what
 * leaving it out does.
 */

/** Sixteen bytes per value, seven of them padding. */
const ScannerReading = struct('ScannerReading', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

type ScannerReading = Struct<typeof ScannerReading>;

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

let calls = 0;
let offsets: number[] = [];

/** `ScannerReading`, counting what the storage asks of it. */
const counted = {
	name: ScannerReading.name,
	layout: ScannerReading.layout,
	read: (view: DataView, offset: number): ScannerReading => {
		calls++;
		offsets.push(offset);

		return ScannerReading.read(view, offset);
	},
	write: (view: DataView, offset: number, value: ScannerReading): void => {
		calls++;
		offsets.push(offset);
		ScannerReading.write(view, offset, value);
	},
	is: (value: unknown): value is ScannerReading => ScannerReading.is(value),
};

const scan: ScannerReading = ScannerReading.from({ value: 1.5, channel: 3 });

/**
 * Writes and reads back every value of a storage.
 *
 * @param scans The storage.
 */
const walk = (scans: Storage<ScannerReading>): void => {
	for (let index = 0; index < scans.length; index++) scans.set(index, scan);
	for (let index = 0; index < scans.length; index++) scans.get(index);
};

beforeEach(() => {
	calls = 0;
	offsets = [];
});

describe('ArrayOfStructures, counted', () => {
	it('should read and write each whole value in one call, at its own offset', () => {
		walk(createFixedBufferStorage(counted, VOLUME, ArrayOfStructures));

		expect(calls).toBe(2 * VOLUME);
		expect(offsets.every((offset, index) => offset === (index % VOLUME) * 16)).toBe(true);
	});

	it('should cost exactly what leaving the layout out costs', () => {
		walk(createFixedBufferStorage(counted, VOLUME, ArrayOfStructures));

		const named: number[] = offsets;

		offsets = [];
		walk(createFixedBufferStorage(counted, VOLUME));

		expect(offsets).toEqual(named);
	});
});
