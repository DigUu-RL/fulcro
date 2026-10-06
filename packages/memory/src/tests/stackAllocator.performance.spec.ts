import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Allocation } from '@/allocator';
import { createStackAllocator, type StackAllocator } from '@/stackAllocator';

import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createStackAllocator`.
 *
 * Counted, never timed (`docs/testing.md`). A stack asks the engine for its
 * buffer once and never again — not per frame, not per allocation — and
 * leaving a frame costs the same however much it allocated.
 */

/** Enough frames for a per-frame cost to separate from a constant one. */
const FRAMES = 10_000;

/** Allocations per frame. */
const PER_FRAME = 10;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createStackAllocator, counted', () => {
	it('should make its one buffer when it is created', () => {
		const buffers = watchBuffers();

		createStackAllocator(4096);

		expect([buffers.made, buffers.bytes]).toEqual([1, 4096]);
	});

	it('should make no buffer however many frames are entered, allocated from and left', () => {
		const stack: StackAllocator = createStackAllocator(4096);
		const buffers = watchBuffers();

		for (let frame = 0; frame < FRAMES; frame++) {
			using scope = stack.enter();

			for (let index = 0; index < PER_FRAME; index++) scope.allocate(16, 8);
		}

		expect(buffers.made).toBe(0);
	});

	it('should leave a frame without visiting what it allocated', () => {
		const stack: StackAllocator = createStackAllocator(FRAMES * 16);
		const allocations: Allocation[] = [];

		{
			using frame = stack.enter();

			for (let index = 0; index < FRAMES; index++) {
				allocations.push(frame.allocate(16, 8));
			}

			(allocations[FRAMES - 1] as Allocation).bytes.setFloat64(0, 42);
		}

		// Nothing was zeroed on the way out: the bytes are cleared when they are
		// handed out again, by the allocation that needs them.
		expect((allocations[FRAMES - 1] as Allocation).bytes.getFloat64(0)).toBe(
			42,
		);
		expect(allocations.every((allocation) => !allocation.isLive())).toBe(true);
	});
});
