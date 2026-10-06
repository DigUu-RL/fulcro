import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Allocation } from '@/allocator';
import { createPoolAllocator, type PoolAllocator } from '@/poolAllocator';

import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createPoolAllocator`.
 *
 * Counted, never timed (`docs/testing.md`). A pool asks the engine for one
 * buffer, of exactly its blocks, and never again: blocks taken and returned
 * in any order — here a shuffled one, not the order they were handed out —
 * are reused rather than replaced.
 */

/** Blocks in the pool. */
const BLOCKS = 1_000;

/** Rounds of taking every block and returning them all, shuffled. */
const ROUNDS = 100;

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * Shuffles in place with a fixed seed, so every run returns blocks in the same
 * order — and that order is not the one they were handed out in.
 *
 * @param values Values to shuffle.
 * @returns The same array.
 */
const shuffle = <T>(values: T[]): T[] => {
	let seed = 42;

	for (let index = values.length - 1; index > 0; index--) {
		seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;

		const other: number = seed % (index + 1);

		[values[index], values[other]] = [values[other] as T, values[index] as T];
	}

	return values;
};

describe('createPoolAllocator, counted', () => {
	it('should make one buffer, of exactly its blocks, when it is created', () => {
		const buffers = watchBuffers();

		createPoolAllocator(64, BLOCKS);

		expect([buffers.made, buffers.bytes]).toEqual([1, 64 * BLOCKS]);
	});

	it('should make no buffer however often its blocks come and go, in any order', () => {
		const pool: PoolAllocator = createPoolAllocator(64, BLOCKS);
		const buffers = watchBuffers();

		for (let round = 0; round < ROUNDS; round++) {
			const taken: Allocation[] = Array.from({ length: BLOCKS }, () =>
				pool.allocate(48, 16),
			);

			for (const allocation of shuffle(taken)) pool.deallocate(allocation);
		}

		expect(buffers.made).toBe(0);
	});

	it('should hand every block out again after a shuffled return, none twice', () => {
		const pool: PoolAllocator = createPoolAllocator(64, BLOCKS);
		const first: Allocation[] = Array.from({ length: BLOCKS }, () =>
			pool.allocate(64, 8),
		);

		for (const allocation of shuffle([...first])) pool.deallocate(allocation);

		const offsets = new Set(
			Array.from(
				{ length: BLOCKS },
				() => pool.allocate(64, 8).bytes.byteOffset,
			),
		);

		expect(offsets.size).toBe(BLOCKS);
	});
});
