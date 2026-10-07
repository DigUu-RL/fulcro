import { beforeEach, describe, expect, it } from 'vitest';

import {
	DoublePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { createFixedBufferStorage } from '@/fixedBufferStorage';
import type { Storage } from '@/storage';

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
const Sample = struct('Sample', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});
type Sample = Struct<typeof Sample>;

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

let reads = 0;
let writes = 0;
let recognitions = 0;
let offsets: number[] = [];

/** `Sample`, counting what the storage asks of it. */
const counted = {
	name: Sample.name,
	layout: Sample.layout,
	read: (view: DataView, offset: number): Sample => {
		reads++;
		offsets.push(offset);

		return Sample.read(view, offset);
	},
	write: (view: DataView, offset: number, value: Sample): void => {
		writes++;
		offsets.push(offset);
		Sample.write(view, offset, value);
	},
	is: (value: unknown): value is Sample => {
		recognitions++;

		return Sample.is(value);
	},
};

const sample: Sample = Sample.from({ value: 1.5, channel: 3 });

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
		const samples: Storage<Sample> = createFixedBufferStorage(counted, VOLUME);

		samples.get(VOLUME - 1);

		expect([reads, writes, recognitions]).toEqual([1, 0, 0]);
	});

	it('should recognise once and write once per set, and read nothing', () => {
		const samples: Storage<Sample> = createFixedBufferStorage(counted, VOLUME);

		samples.set(VOLUME - 1, sample);

		expect([reads, writes, recognitions]).toEqual([0, 1, 1]);
	});

	it('should touch nothing when an index is refused', () => {
		const samples: Storage<Sample> = createFixedBufferStorage(counted, VOLUME);

		expect(() => samples.set(VOLUME, sample)).toThrowError(RangeError);
		expect(() => samples.get(-1)).toThrowError(RangeError);
		expect([reads, writes, recognitions]).toEqual([0, 0, 0]);
	});

	it('should read exactly once per element when a consumer walks it all', () => {
		const samples: Storage<Sample> = createFixedBufferStorage(counted, VOLUME);
		let channels = 0;

		for (let index = 0; index < samples.length; index++) {
			channels += samples.get(index).channel;
		}

		expect(channels).toBe(0);
		expect(reads).toBe(VOLUME);
	});

	it('should place the values end to end, one layout size apart', () => {
		const samples: Storage<Sample> = createFixedBufferStorage(counted, VOLUME);

		for (let index = 0; index < samples.length; index++) {
			samples.set(index, sample);
		}

		const { size } = Sample.layout;

		expect(size).toBe(16);
		expect(offsets).toHaveLength(VOLUME);
		expect(offsets.every((offset, index) => offset === index * size)).toBe(
			true,
		);
	});
});
