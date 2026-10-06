import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DoublePrecisionFloat, type Struct, struct } from '@fulcro/types';

import type { Allocation } from '@/allocator';
import { createLinearMemory, type LinearMemory } from '@/linearMemory';
import type { NativePointer } from '@/nativePointer';
import { nativePointerTo } from '@/nativePointerTo';

import { countedMemory } from './countedMemory';
import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `nativePointerTo`, and for the `NativePointer<T>` it
 * returns.
 *
 * Counted, never timed (`docs/testing.md`). The memory counts every time its
 * buffer is asked for, the element type every read and write, the allocation
 * every liveness question, and the `DataView` and `ArrayBuffer` constructors
 * every view and buffer made. What is asserted: following growth costs one
 * buffer read per access and one new view per growth, not per access; nothing
 * is copied; and the guard against use after release is one question per
 * access.
 */

/** Eight bytes, aligned to eight. */
const Sample = struct('Sample', { value: DoublePrecisionFloat });
type Sample = Struct<typeof Sample>;

/** Enough accesses for a per-access cost to separate from a constant one. */
const VOLUME = 100_000;

let reads = 0;
let writes = 0;

/** `Sample`, counting what the pointer asks of it. */
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

const sample: Sample = Sample.from({ value: 1.5 });

/**
 * Counts every `DataView` made from now on, until `vi.unstubAllGlobals()`.
 *
 * @returns The live count.
 */
const watchViews = (): { made: number } => {
	const count = { made: 0 };

	vi.stubGlobal(
		'DataView',
		new Proxy(DataView, {
			construct: (target, args: unknown[], newTarget) => {
				count.made++;

				return Reflect.construct(target, args, newTarget) as object;
			},
		}),
	);

	return count;
};

beforeEach(() => {
	reads = 0;
	writes = 0;
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('nativePointerTo, counted', () => {
	it('should ask a growable memory for its buffer once per access, and make no view while it does not grow', () => {
		const { backing, counts } = countedMemory(VOLUME * 8);
		const memory: LinearMemory = createLinearMemory(backing);
		const pointer: NativePointer<Sample> = nativePointerTo(memory, 0, counted);
		const views = watchViews();

		counts.reads = 0;

		for (let index = 0; index < VOLUME; index++) pointer.set(sample);
		for (let index = 0; index < VOLUME; index++) pointer.get();

		expect([counts.reads, views.made, reads, writes]).toEqual([
			2 * VOLUME,
			0,
			VOLUME,
			VOLUME,
		]);
	});

	it('should make one new view per growth, however many accesses follow', () => {
		const { backing, grow } = countedMemory(64);
		const pointer: NativePointer<Sample> = nativePointerTo(
			createLinearMemory(backing),
			8,
			counted,
		);
		const views = watchViews();

		for (let growth = 0; growth < 3; growth++) {
			grow(64);

			for (let index = 0; index < VOLUME; index++) pointer.get();
		}

		expect([views.made, reads]).toEqual([3, 3 * VOLUME]);
	});

	it('should make no buffer and copy no byte, however many values it reaches', () => {
		const memory: LinearMemory = createLinearMemory(
			new ArrayBuffer(VOLUME * 8),
		);
		const buffers = watchBuffers();
		const views = watchViews();
		let cursor: NativePointer<Sample> = nativePointerTo(memory, 0, counted);

		for (let index = 0; index < VOLUME; index++) {
			cursor.set(sample);
			cursor = cursor.at(8);
		}

		expect([buffers.made, views.made, writes]).toEqual([0, 0, VOLUME]);
	});

	it('should read nothing when it is made or moved, and ask the memory once per move', () => {
		const { backing, counts } = countedMemory(VOLUME * 8);
		const memory: LinearMemory = createLinearMemory(backing);

		counts.reads = 0;

		let cursor: NativePointer<Sample> = nativePointerTo(memory, 0, counted);

		for (let index = 1; index < VOLUME; index++) cursor = cursor.at(8);

		expect([counts.reads, reads, writes]).toEqual([VOLUME, 0, 0]);
	});

	it('should ask an allocation whether it is live once per access', () => {
		let livenessChecks = 0;
		const allocation: Allocation = {
			bytes: new DataView(new ArrayBuffer(16)),
			isLive: (): boolean => {
				livenessChecks++;

				return true;
			},
		};
		const pointer: NativePointer<Sample> = nativePointerTo(allocation, counted);

		for (let index = 0; index < VOLUME; index++) pointer.set(sample);
		for (let index = 0; index < VOLUME; index++) pointer.get();

		expect([livenessChecks, reads, writes]).toEqual([
			2 * VOLUME,
			VOLUME,
			VOLUME,
		]);
	});
});
