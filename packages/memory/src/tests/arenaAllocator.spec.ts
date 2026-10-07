import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation, AllocationDomain } from '@/allocator';
import { type ArenaAllocator, createArenaAllocator } from '@/arenaAllocator';

import { coded } from './coded';

/**
 * Behaviour suite for `createArenaAllocator`.
 *
 * What the contract suite cannot say: allocations are made front to back in
 * chunks, the arena grows when one is full, and `reset` — or leaving a `using`
 * scope — releases everything at once and reuses the memory, zeroed.
 */

describe('createArenaAllocator', () => {
	it('should place allocations front to back in one chunk while they fit', () => {
		const arena: ArenaAllocator = createArenaAllocator(64);
		const first: Allocation = arena.allocate(8, 8);
		const second: Allocation = arena.allocate(8, 8);

		expect(second.bytes.buffer).toBe(first.bytes.buffer);
		expect(second.bytes.byteOffset).toBe(8);
	});

	it('should take a new chunk once the current one is full', () => {
		const arena: ArenaAllocator = createArenaAllocator(16);
		const first: Allocation = arena.allocate(12, 4);
		const second: Allocation = arena.allocate(12, 4);

		expect(second.bytes.buffer).not.toBe(first.bytes.buffer);
		expect(second.bytes.byteOffset).toBe(0);
		expect(first.isLive()).toBe(true);
	});

	it('should make a chunk exactly as large as a request larger than a chunk', () => {
		const arena: ArenaAllocator = createArenaAllocator(16);
		const large: Allocation = arena.allocate(100, 8);

		expect(large.bytes.buffer.byteLength).toBe(100);
	});

	it('should release every allocation at once on reset', () => {
		const arena: ArenaAllocator = createArenaAllocator(16);
		const allocations: Allocation[] = [1, 2, 3, 4].map(() =>
			arena.allocate(12, 4),
		);

		arena.reset();

		expect(allocations.map((allocation) => allocation.isLive())).toEqual([
			false,
			false,
			false,
			false,
		]);
	});

	it('should reuse its memory after a reset, zeroed, without the old allocation coming back to life', () => {
		const arena: ArenaAllocator = createArenaAllocator(64);
		const before: Allocation = arena.allocate(8, 8);

		before.bytes.setFloat64(0, 42);
		arena.reset();

		const after: Allocation = arena.allocate(8, 8);

		expect(after.bytes.buffer).toBe(before.bytes.buffer);
		expect(after.bytes.byteOffset).toBe(before.bytes.byteOffset);
		expect(after.bytes.getFloat64(0)).toBe(0);
		expect(before.isLive()).toBe(false);
		expect(after.isLive()).toBe(true);
	});

	it('should reset when the scope that entered it ends', () => {
		let made: Allocation | undefined;

		{
			using arena = createArenaAllocator(64);

			made = arena.allocate(8, 8);

			expect(made.isLive()).toBe(true);
		}

		expect(made.isLive()).toBe(false);
	});

	it('should reset when the scope ends by a throw', () => {
		let made: Allocation | undefined;

		expect(() => {
			using arena = createArenaAllocator(64);

			made = arena.allocate(8, 8);

			throw new Error('leaving early');
		}).toThrowError('leaving early');
		expect(made?.isLive()).toBe(false);
	});

	it('should go on allocating after a reset', () => {
		const arena: ArenaAllocator = createArenaAllocator(16);

		arena.allocate(12, 4);
		arena.reset();

		expect(arena.allocate(12, 4).isLive()).toBe(true);
	});

	it('should accept a chunk size of zero, giving every allocation its own chunk', () => {
		const arena: ArenaAllocator = createArenaAllocator(0);
		const first: Allocation = arena.allocate(4, 4);
		const second: Allocation = arena.allocate(4, 4);

		expect(second.bytes.buffer).not.toBe(first.bytes.buffer);
	});

	it.each([
		[-1, '-1'],
		[1.5, '1.5'],
		[Number.NaN, 'NaN'],
	])('should refuse a chunk size of %s', (chunkSize, shown) => {
		expect(() => createArenaAllocator(chunkSize)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7005: createArenaAllocator: expected a size in bytes that is a non-negative safe integer, received ${shown}.`,
				),
				{ operation: 'createArenaAllocator', received: chunkSize },
			),
		);
	});

	it('should be an allocation domain', () => {
		expectTypeOf(createArenaAllocator(64)).toMatchTypeOf<AllocationDomain>();
		expectTypeOf(createArenaAllocator(64)).toEqualTypeOf<ArenaAllocator>();
	});
});
