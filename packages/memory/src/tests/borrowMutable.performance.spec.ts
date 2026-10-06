import { describe, expect, it } from 'vitest';

import { borrowMutable } from '@/borrowMutable';
import type { MutableBorrow } from '@/mutableBorrow';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { countedStorage } from './countedSource';

/**
 * Performance suite for `borrowMutable`, and for the `MutableBorrow<T>` it
 * returns.
 *
 * Counted, never timed (`docs/testing.md`), over a storage that counts every
 * value read from it and written to it. An exclusive borrow is a view: nothing
 * touched when it is made, exactly one read or write per access. Ending the
 * borrows before it is moving a counter on, so it costs the storage nothing
 * however many there were.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

describe('borrowMutable, counted', () => {
	it('should touch nothing when it, a subview or a read-only view is made', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const scores: MutableBorrow<number> = borrowMutable(own(() => storage));

		scores.subview(3).subview(10, 20).readOnly();

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should write each value exactly once, and read none, when filled', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const scores: MutableBorrow<number> = borrowMutable(own(() => storage));

		for (let index = 0; index < scores.length; index++) scores.set(index, 1);

		expect(counts).toEqual({ reads: 0, writes: VOLUME });
	});

	it('should end any number of earlier borrows without touching the storage', () => {
		const { storage, counts } = countedStorage(4);
		const owner: Owned<number> = own(() => storage);

		for (let taken = 0; taken < VOLUME; taken++) borrowMutable(owner);

		const last: MutableBorrow<number> = borrowMutable(owner);

		last.set(0, 1);

		expect(counts).toEqual({ reads: 0, writes: 1 });
	});
});
