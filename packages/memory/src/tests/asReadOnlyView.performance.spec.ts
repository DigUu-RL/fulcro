import { describe, expect, it } from 'vitest';

import { asReadOnlyView } from '@/asReadOnlyView';
import type { ReadOnlyView } from '@/view';

import { countedArray, countedStorage } from './countedSource';

/**
 * Performance suite for `asReadOnlyView`, and for the `ReadOnlyView<T>` it
 * returns.
 *
 * Counted, never timed (`docs/testing.md`), over a source that counts every
 * value read from it. A read-only view makes the promise a view does, and
 * never writes at all.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

describe('asReadOnlyView, counted', () => {
	it('should read nothing when it or a subview is made', () => {
		const { storage, counts } = countedStorage(VOLUME);

		asReadOnlyView(storage, 3).subview(10, 50_000).subview(1);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should read each value exactly once, and write none, when walked', () => {
		const { array, counts } = countedArray(VOLUME);
		const view: ReadOnlyView<number> = asReadOnlyView(array);
		let sum = 0;

		for (let index = 0; index < view.length; index++) sum += view.get(index);

		expect(sum).toBe((VOLUME * (VOLUME - 1)) / 2);
		expect(counts).toEqual({ reads: VOLUME, writes: 0 });
	});

	it('should read through one level however deep subviews nest', () => {
		const { storage, counts } = countedStorage(VOLUME);
		let view: ReadOnlyView<number> = asReadOnlyView(storage);

		for (let level = 1; level < VOLUME; level++) view = view.subview(1);

		expect(view.get(0)).toBe(VOLUME - 1);
		expect(counts.reads).toBe(1);
	});
});
