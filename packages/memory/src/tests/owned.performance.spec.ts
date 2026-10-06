import { describe, expect, it } from 'vitest';

import { borrow } from '@/borrow';
import type { Borrowed } from '@/borrowed';
import { own } from '@/own';

import { countedStorage } from './countedSource';

/**
 * Performance suite for `Owned<T>[Symbol.dispose]`.
 *
 * Counted, never timed (`docs/testing.md`), over a storage that counts every
 * value read from it and written to it. Disposing ends the borrows by moving
 * the ownership's generation on, not by visiting them: it touches no value,
 * however many borrows were taken, and every access refused afterwards is
 * refused before the storage is reached.
 */

/** Enough borrows and values that visiting either would show. */
const VOLUME = 100_000;

/**
 * Accesses refused after the dispose. Each refusal creates an error, stack
 * included, so this is sized to show one read per access, not to stress.
 */
const REFUSALS = 1_000;

describe('Owned[Symbol.dispose], counted', () => {
	it('should touch no value, however many borrows were taken', () => {
		const { storage, counts } = countedStorage(VOLUME);
		const borrows: Borrowed<number>[] = [];

		{
			using owner = own(() => storage);

			for (let step = 0; step < VOLUME; step++) borrows.push(borrow(owner));
		}

		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should refuse every access afterwards without reaching the storage', () => {
		const { storage, counts } = countedStorage(VOLUME);
		let reading: Borrowed<number> | undefined;
		let refused = 0;

		{
			using owner = own(() => storage);

			reading = borrow(owner);
		}

		for (let index = 0; index < REFUSALS; index++) {
			try {
				reading.get(index);
			} catch (error) {
				if ((error as { code?: unknown }).code === 'FULCRO7024') refused++;
			}
		}

		expect(refused).toBe(REFUSALS);
		expect(counts).toEqual({ reads: 0, writes: 0 });
	});

	it('should leave the accesses made inside the scope at one each', () => {
		const { storage, counts } = countedStorage(VOLUME);

		{
			using owner = own(() => storage);
			const reading: Borrowed<number> = borrow(owner);

			for (let index = 0; index < VOLUME; index++) reading.get(index);
		}

		expect(counts).toEqual({ reads: VOLUME, writes: 0 });
	});
});
