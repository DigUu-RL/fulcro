import { beforeEach, describe, expect, it } from 'vitest';

import {
	DoublePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/allocate';
import type { Allocation, Allocator } from '@/allocator';
import type { Storage } from '@/storage';

/**
 * Performance suite for `allocate`.
 *
 * Counted, never timed (`docs/testing.md`). The element type and the allocator
 * are both wrapped, so every request, every read and write, and every question
 * about whether the memory is still live is counted. What is asserted: one
 * request per storage, nothing made at creation, and the guard against use
 * after release costing exactly one question per access.
 */

/** Sixteen bytes per value, aligned to eight. */
const Sample = struct('Sample', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});
type Sample = Struct<typeof Sample>;

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

let requests = 0;
let livenessChecks = 0;
let reads = 0;
let writes = 0;

/** `Sample`, counting what the storage asks of it. */
const counted = {
	name: Sample.name,
	layout: Sample.layout,
	read: (view: DataView, offset: number): Sample => {
		reads++;

		return Sample.read(view, offset);
	},
	write: (view: DataView, offset: number, value: Sample): void => {
		writes++;
		Sample.write(view, offset, value);
	},
	is: (value: unknown): value is Sample => Sample.is(value),
};

/** An allocator counting requests, whose allocations count liveness checks. */
const allocator: Allocator = {
	allocate: (size: number): Allocation => {
		requests++;

		return {
			bytes: new DataView(new ArrayBuffer(size)),
			isLive: (): boolean => {
				livenessChecks++;

				return true;
			},
		};
	},
};

const sample: Sample = Sample.from({ value: 1.5, channel: 3 });

beforeEach(() => {
	requests = 0;
	livenessChecks = 0;
	reads = 0;
	writes = 0;
});

describe('allocate, counted', () => {
	it('should make one request and nothing else, however long', () => {
		allocate(counted, VOLUME, allocator);

		expect([requests, livenessChecks, reads, writes]).toEqual([1, 0, 0, 0]);
	});

	it('should ask once whether the memory is live per access, and read once per get', () => {
		const samples: Storage<Sample> = allocate(counted, VOLUME, allocator);

		for (let index = 0; index < VOLUME; index++) samples.set(index, sample);
		for (let index = 0; index < VOLUME; index++) samples.get(index);

		expect([livenessChecks, reads, writes]).toEqual([
			2 * VOLUME,
			VOLUME,
			VOLUME,
		]);
	});
});
