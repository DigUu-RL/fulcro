import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Allocator } from '@/allocator';
import { createManagedAllocator } from '@/managedAllocator';

import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createManagedAllocator`.
 *
 * Counted, never timed (`docs/testing.md`): every `ArrayBuffer` made is
 * counted, with its size. The strategy promises one buffer per allocation, of
 * exactly the bytes asked for — no chunk reserved ahead, no padding added.
 */

/** Enough allocations for a per-allocation cost to separate from a constant one. */
const VOLUME = 10_000;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createManagedAllocator, counted', () => {
	it('should make nothing when it is created', () => {
		const buffers = watchBuffers();

		createManagedAllocator();

		expect(buffers.made).toBe(0);
	});

	it('should make one buffer per allocation, of exactly the bytes asked for', () => {
		const allocator: Allocator = createManagedAllocator();
		const buffers = watchBuffers();

		for (let index = 0; index < VOLUME; index++) {
			allocator.allocate(index % 7, 1 << (index % 4));
		}

		const asked: number = Array.from(
			{ length: VOLUME },
			(_, index) => index % 7,
		).reduce((sum, size) => sum + size, 0);

		expect(buffers.made).toBe(VOLUME);
		expect(buffers.bytes).toBe(asked);
	});
});
