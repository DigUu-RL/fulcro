import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Allocation } from '@/allocator';
import { type ArenaAllocator, createArenaAllocator } from '@/arenaAllocator';

import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createArenaAllocator`.
 *
 * Counted, never timed (`docs/testing.md`). An arena exists to ask the engine
 * for memory a chunk at a time rather than an allocation at a time, and to ask
 * for none at all once its chunks are reused: what is counted is the buffers
 * it makes, and what a reset costs the allocations it releases.
 */

/** Enough allocations to fill many chunks. */
const VOLUME = 100_000;

/** Bytes per allocation, and per chunk: 128 allocations fill one. */
const SIZE = 16;
const CHUNK = 2048;

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * Fills an arena with {@link VOLUME} allocations of {@link SIZE} bytes.
 *
 * @param arena Arena to fill.
 * @returns The allocations.
 */
const fill = (arena: ArenaAllocator): Allocation[] =>
	Array.from({ length: VOLUME }, () => arena.allocate(SIZE, 8));

describe('createArenaAllocator, counted', () => {
	it('should make nothing when it is created', () => {
		const buffers = watchBuffers();

		createArenaAllocator(CHUNK);

		expect(buffers.made).toBe(0);
	});

	it('should make one buffer per chunk filled, not one per allocation', () => {
		const arena: ArenaAllocator = createArenaAllocator(CHUNK);
		const buffers = watchBuffers();

		fill(arena);

		expect(buffers.made).toBe(Math.ceil((VOLUME * SIZE) / CHUNK));
		expect(buffers.bytes).toBe(buffers.made * CHUNK);
	});

	it('should make no buffer at all on a pass after a reset', () => {
		const arena: ArenaAllocator = createArenaAllocator(CHUNK);

		fill(arena);
		arena.reset();

		const buffers = watchBuffers();

		fill(arena);

		expect(buffers.made).toBe(0);
	});

	it('should release every allocation without visiting one', () => {
		const arena: ArenaAllocator = createArenaAllocator(CHUNK);
		const allocations: Allocation[] = fill(arena);
		const last = allocations[VOLUME - 1] as Allocation;

		last.bytes.setFloat64(0, 42);
		arena.reset();

		// Nothing was zeroed or touched on the way out: the bytes are cleared
		// when they are handed out again, by the allocation that needs them.
		expect(last.bytes.getFloat64(0)).toBe(42);
		expect(allocations.every((allocation) => !allocation.isLive())).toBe(true);
	});
});
