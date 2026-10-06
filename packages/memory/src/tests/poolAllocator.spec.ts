import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation } from '@/allocator';
import { createManagedAllocator } from '@/managedAllocator';
import { createPoolAllocator, type PoolAllocator } from '@/poolAllocator';

import { coded } from './coded';

/**
 * Behaviour suite for `createPoolAllocator`.
 *
 * What the contract suite cannot say: memory comes in blocks of one size,
 * each returned on its own and in any order, a returned block is reused
 * without the old allocation coming back to life, and the pool refuses what
 * it did not make or already took back.
 */

describe('createPoolAllocator', () => {
	it('should fill from the front, one block per allocation', () => {
		const pool: PoolAllocator = createPoolAllocator(32, 4);
		const offsets: number[] = [0, 1, 2].map(
			() => pool.allocate(8, 8).bytes.byteOffset,
		);

		expect(offsets).toEqual([0, 32, 64]);
	});

	it('should take blocks back in any order', () => {
		const pool: PoolAllocator = createPoolAllocator(16, 3);
		const [first, second, third] = [0, 1, 2].map(() =>
			pool.allocate(16, 16),
		) as [Allocation, Allocation, Allocation];

		pool.deallocate(second);
		pool.deallocate(first);

		expect([first.isLive(), second.isLive(), third.isLive()]).toEqual([
			false,
			false,
			true,
		]);
	});

	it('should reuse a returned block, zeroed, without the old allocation coming back to life', () => {
		const pool: PoolAllocator = createPoolAllocator(8, 1);
		const before: Allocation = pool.allocate(8, 8);

		before.bytes.setFloat64(0, 42);
		pool.deallocate(before);

		const after: Allocation = pool.allocate(8, 8);

		expect(after.bytes.byteOffset).toBe(before.bytes.byteOffset);
		expect(after.bytes.getFloat64(0)).toBe(0);
		expect(before.isLive()).toBe(false);
		expect(after.isLive()).toBe(true);
	});

	it('should refuse a request once every block is out', () => {
		const pool: PoolAllocator = createPoolAllocator(16, 2);

		pool.allocate(16, 8);
		pool.allocate(16, 8);

		expect(() => pool.allocate(4, 4)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7007: PoolAllocator.allocate: 4 bytes aligned to 4 were requested, but only 0 of 32 bytes remain.',
				),
				{
					operation: 'PoolAllocator.allocate',
					requested: 4,
					alignment: 4,
					available: 0,
					capacity: 32,
				},
			),
		);
	});

	it.each([
		[48, 16],
		[1, 1],
		[0, 8],
	])(
		'should accept %s bytes aligned to %s from blocks of 48 bytes',
		(requested, alignment) => {
			const pool: PoolAllocator = createPoolAllocator(48, 2);

			pool.allocate(1, 1);

			const { bytes } = pool.allocate(requested, alignment);

			expect(bytes.byteLength).toBe(requested);
			expect(bytes.byteOffset % alignment).toBe(0);
		},
	);

	it.each([
		[49, 8],
		[8, 32],
	])(
		'should refuse %s bytes aligned to %s from blocks of 48 bytes',
		(requested, alignment) => {
			expect(() =>
				createPoolAllocator(48, 2).allocate(requested, alignment),
			).toThrowError(
				coded(
					new RangeError(
						`FULCRO7010: PoolAllocator.allocate: ${requested} bytes aligned to ${alignment} do not fit a pool block of 48 bytes.`,
					),
					{
						operation: 'PoolAllocator.allocate',
						requested,
						alignment,
						blockSize: 48,
					},
				),
			);
		},
	);

	it('should refuse to take back an allocation it did not make', () => {
		const pool: PoolAllocator = createPoolAllocator(16, 2);
		const elsewhere: Allocation = createManagedAllocator().allocate(16, 8);
		const otherPool: Allocation = createPoolAllocator(16, 2).allocate(16, 8);

		for (const allocation of [elsewhere, otherPool]) {
			expect(() => pool.deallocate(allocation)).toThrowError(
				coded(
					new Error(
						'FULCRO7011: PoolAllocator.deallocate: the allocation was not made by this allocator.',
					),
					{ operation: 'PoolAllocator.deallocate' },
				),
			);
		}
	});

	it('should refuse to take back an allocation twice, even once its block was reused', () => {
		const pool: PoolAllocator = createPoolAllocator(16, 1);
		const first: Allocation = pool.allocate(16, 8);

		pool.deallocate(first);

		const second: Allocation = pool.allocate(16, 8);

		expect(() => pool.deallocate(first)).toThrowError(
			coded(
				new Error(
					'FULCRO7009: PoolAllocator.deallocate: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'PoolAllocator.deallocate' },
			),
		);
		expect(second.isLive()).toBe(true);
	});

	it('should refuse a block size or a block count that is not a count', () => {
		expect(() => createPoolAllocator(-1, 1)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7005: createPoolAllocator: expected a size in bytes that is a non-negative safe integer, received -1.',
				),
				{ operation: 'createPoolAllocator', received: -1 },
			),
		);
		expect(() => createPoolAllocator(8, 1.5)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7001: createPoolAllocator: expected a length that is a non-negative safe integer, received 1.5.',
				),
				{ operation: 'createPoolAllocator', received: 1.5 },
			),
		);
	});

	it('should be an allocator with a deallocate, and not a domain', () => {
		expectTypeOf(createPoolAllocator(8, 1)).toEqualTypeOf<PoolAllocator>();
		expectTypeOf<PoolAllocator>().not.toMatchTypeOf<Disposable>();
	});
});
