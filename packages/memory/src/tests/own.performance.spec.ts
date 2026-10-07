import { describe, expect, it } from 'vitest';

import { own } from '@/own';
import type { Owned } from '@/owned';

import { countedStorage } from './countedSource';

/**
 * Performance suite for `own`.
 *
 * Counted, never timed (`docs/testing.md`), over a storage that counts every
 * value read from it and written to it. Taking ownership reads nothing and
 * copies nothing, whatever the storage holds; asking the owner its length
 * asks the storage, and nothing more.
 */

/** Enough values that a copy or a scan would show. */
const VOLUME = 100_000;

describe('own, counted', () => {
	it('should read, write and copy nothing, however many values the storage holds', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const owner: Owned<number> = own(() => storage);

		expect(owner.length).toBe(VOLUME);
		expect(counts).toEqual({ reads: 0, writes: 0 });
	});
});
