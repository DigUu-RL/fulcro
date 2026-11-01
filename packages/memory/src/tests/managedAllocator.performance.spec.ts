import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Allocator } from '@/src/allocator';
import { createManagedAllocator, type ManagedAllocator } from '@/src/managedAllocator';
import { watchBuffers } from '@/src/tests/watchBuffers';

/**
 * Performance suite for `createManagedAllocator`.
 *
 * Counted, never timed (`docs/testing.md`): every `ArrayBuffer` made is
 * counted, with its size. The strategy promises one buffer per allocation, of
 * exactly the bytes asked for — no chunk reserved ahead, no padding added —
 * and frames that, once the region is sized, make no buffer at all.
 */

/** Enough allocations for a per-allocation cost to separate from a constant one. */
const VOLUME = 10_000;

/** Allocations per frame. */
const PER_FRAME = 10;

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

		const asked: number = Array.from({ length: VOLUME }, (_, index) => index % 7).reduce(
			(sum, size) => sum + size,
			0,
		);

		expect(buffers.made).toBe(VOLUME);
		expect(buffers.bytes).toBe(asked);
	});

	it('should make nothing when a frame is entered and left', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const buffers = watchBuffers();

		for (let index = 0; index < VOLUME; index++) allocator.enter()[Symbol.dispose]();

		expect(buffers.made).toBe(0);
	});

	it('should make buffers only for the first of many frames, and one more for the region', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const buffers = watchBuffers();

		for (let index = 0; index < VOLUME; index++) {
			using frame = allocator.enter();

			for (let part = 0; part < PER_FRAME; part++) frame.allocate(16, 8);
		}

		// The first frame makes one buffer per allocation, since no region exists
		// yet; leaving it makes the region, sized for exactly what it held.
		expect(buffers.made).toBe(PER_FRAME + 1);
		expect(buffers.bytes).toBe(PER_FRAME * 16 * 2);
	});

	it('should size the region for the most that nested frames held at once', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		const nest = (depth: number): void => {
			using frame = allocator.enter();

			frame.allocate(16, 8);

			if (depth > 1) nest(depth - 1);
		};

		nest(PER_FRAME);

		const buffers = watchBuffers();

		for (let index = 0; index < VOLUME; index++) nest(PER_FRAME);

		expect(buffers.made).toBe(0);
	});

	it('should grow the region once when a frame outgrows it, and not again', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		const step = (size: number): void => {
			using frame = allocator.enter();

			frame.allocate(size, 8);
		};

		step(16);

		const buffers = watchBuffers();

		step(1_024);

		for (let index = 0; index < VOLUME; index++) step(index % 2 === 0 ? 16 : 1_024);

		expect([buffers.made, buffers.bytes]).toEqual([2, 2_048]);
	});
});
