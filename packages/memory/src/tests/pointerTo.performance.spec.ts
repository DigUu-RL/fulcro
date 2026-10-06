import { describe, expect, it } from 'vitest';

import { asView } from '@/asView';
import type { Pointer } from '@/pointer';
import { pointerTo } from '@/pointerTo';

import { countedArray, countedStorage } from './countedSource';

/**
 * Performance suite for `pointerTo`, and for the `Pointer<T>` it returns.
 *
 * Counted, never timed (`docs/testing.md`), over a source that counts every
 * value read from it and written to it. A pointer is a position: making one
 * or moving one reads nothing, and an access through it costs one access to
 * its source.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

describe('pointerTo, counted', () => {
	it('should read nothing when it is made or moved', () => {
		const { storage, counts } = countedStorage(VOLUME);

		pointerTo(storage, 0).offset(VOLUME).offset(-1);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should cost one source access per get and per set', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const pointer: Pointer<number> = pointerTo(storage, VOLUME - 1);

		pointer.get();
		pointer.set(0);

		expect(counts).toEqual({ reads: 1, writes: 1 });
	});

	it('should read each value exactly once when a loop steps through', () => {
		const { array, counts } = countedArray(VOLUME);
		let sum = 0;

		for (
			let cursor: Pointer<number> = pointerTo(array, 0);
			cursor.index < VOLUME;
			cursor = cursor.offset(1)
		) {
			sum += cursor.get();
		}

		expect(sum).toBe((VOLUME * (VOLUME - 1)) / 2);
		expect(counts.reads).toBe(VOLUME);
	});

	it('should read nothing when a view is made from where it points', () => {
		const { storage, counts } = countedStorage(VOLUME);

		asView(pointerTo(storage, 10), VOLUME - 10);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});
});
