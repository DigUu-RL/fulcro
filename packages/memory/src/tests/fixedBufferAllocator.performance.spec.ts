import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	createFixedBufferAllocator,
	type FixedBufferAllocator,
} from '@/fixedBufferAllocator';

import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createFixedBufferAllocator`.
 *
 * Counted, never timed (`docs/testing.md`). The strategy's whole promise is
 * that it never asks the engine for memory: the buffer is the caller's, and
 * every allocation, every reset and every pass after one comes out of it.
 */

/** Passes over the buffer, each filling it and resetting. */
const PASSES = 1_000;

/** Allocations that fill the buffer in one pass. */
const PER_PASS = 64;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createFixedBufferAllocator, counted', () => {
	it('should make no buffer, ever', () => {
		const memory = new ArrayBuffer(PER_PASS * 16);
		const buffers = watchBuffers();
		const allocator: FixedBufferAllocator = createFixedBufferAllocator(memory);

		for (let pass = 0; pass < PASSES; pass++) {
			for (let index = 0; index < PER_PASS; index++) {
				allocator.allocate(16, 8);
			}

			allocator.reset();
		}

		expect(buffers.made).toBe(0);
	});
});
