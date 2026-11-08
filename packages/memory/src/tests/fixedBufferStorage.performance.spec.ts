import { beforeEach, describe, expect, it } from 'vitest';

import { DoublePrecisionFloat, type Struct, struct, UnsignedInteger } from '@fulcro/types';

import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { Storage } from '@/src/storage';

/**
 * Performance suite for `createFixedBufferStorage`.
 *
 * Counted, never timed (`docs/testing.md`): the element type is wrapped so
 * every read, write and recognition it is asked for is counted, along with the
 * offset it was asked at. What is asserted is the promise the strategy makes —
 * nothing is made at creation, one access costs one call, and the values sit
 * end to end with no byte between them.
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
let offsets: number[] = [];

/** `ScannerReading`, counting what the storage asks of it. */
const counted = {
	name: ScannerReading.name,
	layout: ScannerReading.layout,
	read: (view: DataView, offset: number): ScannerReading => {
		reads++;
		offsets.push(offset);

		return ScannerReading.read(view, offset);
	},
	write: (view: DataView, offset: number, value: ScannerReading): void => {
		writes++;
		offsets.push(offset);
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
	offsets = [];
});

describe('createFixedBufferStorage, counted', () => {
	it('should make nothing when it is created, however long', () => {
		createFixedBufferStorage(counted, VOLUME);

		expect([reads, writes, recognitions]).toEqual([0, 0, 0]);
	});

	it('should read once per get, and write nothing', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME);

		scans.get(VOLUME - 1);

		expect([reads, writes, recognitions]).toEqual([1, 0, 0]);
	});

	it('should recognise once and write once per set, and read nothing', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME);

		scans.set(VOLUME - 1, scan);

		expect([reads, writes, recognitions]).toEqual([0, 1, 1]);
	});

	it('should touch nothing when an index is refused', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME);

		expect(() => {
			scans.set(VOLUME, scan);
		}).toThrow(RangeError);

		expect(() => scans.get(-1)).toThrow(RangeError);
		expect([reads, writes, recognitions]).toEqual([0, 0, 0]);
	});

	it('should read exactly once per element when a consumer walks it all', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME);
		let channels = 0;

		for (let index = 0; index < scans.length; index++) {
			channels += scans.get(index).channel;
		}

		expect(channels).toBe(0);
		expect(reads).toBe(VOLUME);
	});

	it('should place the values end to end, one layout size apart', () => {
		const scans: Storage<ScannerReading> = createFixedBufferStorage(counted, VOLUME);

		for (let index = 0; index < scans.length; index++) {
			scans.set(index, scan);
		}

		const { size } = ScannerReading.layout;

		expect(size).toBe(16);
		expect(offsets).toHaveLength(VOLUME);
		expect(offsets.every((offset, index) => offset === index * size)).toBe(true);
	});
});
