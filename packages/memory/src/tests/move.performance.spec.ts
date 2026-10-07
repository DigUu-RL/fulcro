import { describe, expect, it } from 'vitest';

import { borrow } from '@/borrow';
import { move } from '@/move';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { countedStorage } from './countedSource';

/**
 * Performance suite for `move`.
 *
 * Counted, never timed (`docs/testing.md`), over a storage that counts every
 * value read from it and written to it. A move hands the same storage on: it
 * copies nothing, whatever the storage's size, and a long chain of moves adds
 * nothing to what an access costs afterwards.
 */

/** Enough values that a copy would show. */
const VOLUME = 100_000;

describe('move, counted', () => {
	it('should copy nothing, however many values the storage holds', () => {
		const { storage, counts } = countedStorage(VOLUME);

		move(own(() => storage));

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should leave an access at one read after a long chain of moves', () => {
		const { storage, counts } = countedStorage(VOLUME);
		let owner: Owned<number> = own(() => storage);

		for (let step = 0; step < VOLUME; step++) owner = move(owner);

		expect(borrow(owner).get(VOLUME - 1)).toBe(VOLUME - 1);
		expect(counts).toEqual({ reads: 1, writes: 0 });
	});
});
