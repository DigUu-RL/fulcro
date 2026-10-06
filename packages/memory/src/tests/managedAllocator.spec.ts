import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation, Allocator } from '@/allocator';
import { createManagedAllocator } from '@/managedAllocator';

/**
 * Behaviour suite for `createManagedAllocator`.
 *
 * What the contract suite cannot say: every allocation is a buffer of its own,
 * and none of them is ever released — the garbage collector reclaims an
 * allocation only once nothing holds it, so one still held is always live.
 */

describe('createManagedAllocator', () => {
	it('should give every allocation a buffer of its own, starting at zero', () => {
		const allocator: Allocator = createManagedAllocator();
		const first: Allocation = allocator.allocate(16, 8);
		const second: Allocation = allocator.allocate(16, 8);

		expect(first.bytes.buffer).not.toBe(second.bytes.buffer);
		expect(first.bytes.byteOffset).toBe(0);
		expect(first.bytes.buffer.byteLength).toBe(16);
	});

	it('should keep every allocation live, however many follow it', () => {
		const allocator: Allocator = createManagedAllocator();
		const first: Allocation = allocator.allocate(8, 8);

		for (let count = 0; count < 1_000; count++) allocator.allocate(8, 8);

		expect(first.isLive()).toBe(true);
	});

	it('should have nothing to release by hand', () => {
		expectTypeOf(createManagedAllocator()).toEqualTypeOf<Allocator>();
		expect(Object.keys(createManagedAllocator())).toEqual(['allocate']);
	});
});
