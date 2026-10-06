import { describe, expect, it } from 'vitest';

import { DoublePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/allocate';
import type { Allocation, Allocator } from '@/allocator';
import { borrow } from '@/borrow';
import type { Borrowed } from '@/borrowed';
import { own } from '@/own';
import type { Owned } from '@/owned';
import type { ReadOnlyView } from '@/view';

import { countedStorage } from './countedSource';

/**
 * Performance suite for `borrow`, and for the `Borrowed<T>` it returns.
 *
 * Counted, never timed (`docs/testing.md`), over a storage that counts every
 * value read from it. A borrow promises what a view promises — nothing read
 * when it is made, one read per access — plus one comparison to tell whether
 * it has ended, which costs the storage nothing.
 *
 * What a single access costs depends on the storage owned. Over a storage the
 * engine manages, or one written outside the package: one read. Over a
 * storage from `allocate`: one read and one question about whether its memory
 * is still live — the storage's own, the borrow adding no second one.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

describe('borrow, counted', () => {
	it('should read nothing when it or a subview is made', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const owner: Owned<number> = own(() => storage);

		borrow(owner).subview(10, 50_000).subview(1);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should read each value exactly once, and write none, when walked', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const values: Borrowed<number> = borrow(own(() => storage));
		let sum = 0;

		for (let index = 0; index < values.length; index++) {
			sum += values.get(index);
		}

		expect(sum).toBe((VOLUME * (VOLUME - 1)) / 2);
		expect(counts).toEqual({ reads: VOLUME, writes: 0 });
	});

	it('should read through one level however deep subviews nest', () => {
		const { storage, counts } = countedStorage(VOLUME);
		let view: ReadOnlyView<number> = borrow(own(() => storage));

		for (let level = 1; level < VOLUME; level++) view = view.subview(1);

		expect(view.get(0)).toBe(VOLUME - 1);
		expect(counts.reads).toBe(1);
	});

	it('should cost one read per access however many borrows were taken', () => {
		const { storage, counts } = countedStorage(4);
		const owner: Owned<number> = own(() => storage);

		for (let taken = 0; taken < VOLUME; taken++) borrow(owner);

		const last: Borrowed<number> = borrow(owner);

		last.get(3);

		expect(counts.reads).toBe(1);
	});

	it('should ask once per access whether allocated memory is live', () => {
		const Sample = struct('Sample', { value: DoublePrecisionFloat });
		let livenessChecks = 0;
		const allocator: Allocator = {
			allocate: (size: number): Allocation => ({
				bytes: new DataView(new ArrayBuffer(size)),
				isLive: (): boolean => {
					livenessChecks++;

					return true;
				},
			}),
		};
		const values: Borrowed<Struct<typeof Sample>> = borrow(
			own(() => allocate(Sample, VOLUME, allocator)),
		);

		for (let index = 0; index < VOLUME; index++) values.get(index);

		expect(livenessChecks).toBe(VOLUME);
	});
});
