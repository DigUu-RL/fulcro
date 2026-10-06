import { describe, expect, it } from 'vitest';

import { asView } from '@/asView';
import type { View } from '@/view';

import { countedArray, countedStorage } from './countedSource';

/**
 * Performance suite for `asView`, and for the `View<T>` it returns.
 *
 * Counted, never timed (`docs/testing.md`). The source counts every value
 * read from it and written to it. What is asserted is the promise a view
 * makes: making one — or a subview, or its read-only twin — copies nothing
 * and reads nothing, however long the region; an access through it costs one
 * access to the source; and nesting subviews never stacks indirections.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

describe('asView, counted', () => {
	it('should read nothing when it is made, however long the region', () => {
		const { storage, counts } = countedStorage(VOLUME);

		asView(storage);
		asView(storage, 10, VOLUME - 20);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should read no element of an array when it is made', () => {
		const { array, counts } = countedArray(VOLUME);

		asView(array, 1);

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should read nothing for a subview or a read-only view', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const view: View<number> = asView(storage);

		view.subview(5, 1_000).subview(10);
		view.readOnly();

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should cost one source access per get and per set', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const view: View<number> = asView(storage, 100);

		view.get(VOLUME - 101);

		expect(counts).toEqual({ reads: 1, writes: 0 });

		view.set(0, 1);

		expect(counts).toEqual({ reads: 1, writes: 1 });
	});

	it('should touch nothing when an index is refused', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const view: View<number> = asView(storage, 0, 10);

		expect(() => view.get(10)).toThrowError(RangeError);
		expect(() => view.set(-1, 0)).toThrowError(RangeError);
		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should read each value exactly once when a consumer walks it all', () => {
		const { array, counts } = countedArray(VOLUME);
		const view: View<number> = asView(array);
		let sum = 0;

		for (let index = 0; index < view.length; index++) sum += view.get(index);

		expect(sum).toBe((VOLUME * (VOLUME - 1)) / 2);
		expect(counts.reads).toBe(VOLUME);
	});

	// A subview that wrapped the view it came from would pass every access
	// down one more level per nesting: this many levels would overflow the
	// call stack before reading anything.
	it('should read through one level however deep subviews nest', () => {
		const { storage, counts } = countedStorage(VOLUME);
		let view: View<number> = asView(storage);

		for (let level = 1; level < VOLUME; level++) view = view.subview(1);

		expect(view.length).toBe(1);
		expect(view.get(0)).toBe(VOLUME - 1);
		expect(counts.reads).toBe(1);
	});
});
