import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinearMemory, type LinearMemory } from '@/linearMemory';

import { countedMemory } from './countedMemory';
import { watchBuffers } from './watchBuffers';

/**
 * Performance suite for `createLinearMemory`.
 *
 * Counted, never timed (`docs/testing.md`). A linear memory is a way of seeing
 * bytes that already exist: making one copies nothing and allocates no buffer,
 * whatever their size, and asking its length asks the memory once.
 */

/** Large enough that a copy would be impossible to miss. */
const BYTES = 16 * 1024 * 1024;

/** Enough questions for a per-question cost to separate from a constant one. */
const VOLUME = 100_000;

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createLinearMemory, counted', () => {
	it('should make no buffer over an ArrayBuffer, however large', () => {
		const buffer = new ArrayBuffer(BYTES);
		const buffers = watchBuffers();

		createLinearMemory(buffer);

		expect(buffers).toEqual({ made: 0, bytes: 0 });
	});

	it('should ask a growable memory for its buffer once when made, and once per length asked', () => {
		const { backing, counts } = countedMemory(BYTES);
		const buffers = watchBuffers();
		const memory: LinearMemory = createLinearMemory(backing);

		expect(counts.reads).toBe(1);

		let total = 0;

		for (let index = 0; index < VOLUME; index++) total += memory.byteLength;

		expect(total).toBe(VOLUME * BYTES);
		expect([counts.reads, buffers.made]).toEqual([1 + VOLUME, 0]);
	});
});
