import { createError } from '@fulcro/errors';

import type { Allocation, Allocator } from '@/allocator';
import { requireRequest, requireSize } from '@/allocator/requireRequest';
import { requireLength } from '@/storage/requireLength';

/**
 * An allocator of blocks of one size, each returned on its own, in any order.
 */
export interface PoolAllocator extends Allocator {
	/**
	 * Reserves one block. The allocation it returns can give its block back on
	 * its own, so `using` returns it when the scope ends:
	 *
	 * ```ts
	 * {
	 * 	using message = pool.allocate(48, 8);
	 * 	// …
	 * } // the block is the pool's again
	 * ```
	 *
	 * Disposing an allocation whose block was already returned does nothing,
	 * even once the block was handed to someone else.
	 *
	 * @param size How many bytes, at most the block size.
	 * @param alignment A power of two dividing the block size.
	 * @returns The allocation, disposable.
	 * @throws {RangeError} When the request does not fit a block, or every
	 * block is out.
	 */
	allocate(size: number, alignment: number): Allocation & Disposable;

	/**
	 * Returns one allocation's block to the pool, for the next request to reuse.
	 * The allocation reports `isLive()` as `false` from now on.
	 *
	 * @param allocation An allocation this pool made and has not taken back.
	 * @throws {Error} When this pool did not make it, or already took it back.
	 */
	deallocate(allocation: Allocation): void;
}

/** Which block an allocation holds, and the block's generation at the time. */
interface Lease {
	readonly block: number;
	readonly generation: number;
}

/**
 * Creates a pool: one buffer cut into blocks of the same size, each handed out
 * whole and returned on its own.
 *
 * ```ts
 * const pool: PoolAllocator = createPoolAllocator(64, 1024);
 *
 * const message = pool.allocate(48, 8);
 * // …
 * pool.deallocate(message);
 * ```
 *
 * For many objects of one size whose lifetimes do not nest — connections,
 * messages, entities that come and go in any order. Allocating and returning
 * a block cost the same whatever the pool holds, the buffer is allocated once,
 * at creation, and a request is refused when every block is out.
 *
 * Every block starts at a multiple of `blockSize`, so a request is accepted
 * when its size fits a block and its alignment divides the block size.
 *
 * @param blockSize Size of each block, in bytes.
 * @param blockCount How many blocks.
 * @returns The pool, frozen.
 * @throws {RangeError} When the block size or the block count is not a
 * non-negative safe integer.
 */
export const createPoolAllocator = (
	blockSize: number,
	blockCount: number,
): PoolAllocator => {
	requireSize('createPoolAllocator', blockSize);
	requireLength('createPoolAllocator', blockCount);

	const capacity: number = blockSize * blockCount;
	const buffer = new ArrayBuffer(capacity);

	// The free blocks, the next one to hand out last, so the pool fills from
	// the front of the buffer.
	const free: number[] = Array.from(
		{ length: blockCount },
		(_, index) => blockCount - 1 - index,
	);

	// A block's generation moves on every time it comes back, which is what
	// tells an allocation still holding it from one that held it before.
	const generations = new Float64Array(blockCount);
	const leases = new WeakMap<Allocation, Lease>();

	/**
	 * Gives a block back, for the next request to reuse.
	 *
	 * @param lease The block, and the generation that held it.
	 */
	const giveBack = (lease: Lease): void => {
		generations[lease.block] = lease.generation + 1;
		free.push(lease.block);
	};

	return Object.freeze({
		allocate: (size: number, alignment: number): Allocation & Disposable => {
			requireRequest('PoolAllocator.allocate', size, alignment);

			if (size > blockSize || blockSize % alignment !== 0) {
				throw createError('FULCRO7010', {
					operation: 'PoolAllocator.allocate',
					requested: size,
					alignment,
					blockSize,
				});
			}

			const block: number | undefined = free.pop();

			if (block === undefined) {
				throw createError('FULCRO7007', {
					operation: 'PoolAllocator.allocate',
					requested: size,
					alignment,
					available: 0,
					capacity,
				});
			}

			const start: number = block * blockSize;
			const lease: Lease = {
				block,
				generation: generations[block] as number,
			};
			const isLive = (): boolean => generations[block] === lease.generation;

			new Uint8Array(buffer, start, size).fill(0);

			const allocation: Allocation & Disposable = Object.freeze({
				bytes: new DataView(buffer, start, size),
				isLive,

				// Returning a block twice, or one already handed on, would put it
				// in the free list beside its new holder; the generation tells.
				[Symbol.dispose]: (): void => {
					if (isLive()) giveBack(lease);
				},
			});

			leases.set(allocation, lease);

			return allocation;
		},

		deallocate: (allocation: Allocation): void => {
			const lease: Lease | undefined = leases.get(allocation);

			if (lease === undefined) {
				throw createError('FULCRO7011', {
					operation: 'PoolAllocator.deallocate',
				});
			}

			if (generations[lease.block] !== lease.generation) {
				throw createError('FULCRO7009', {
					operation: 'PoolAllocator.deallocate',
				});
			}

			giveBack(lease);
		},
	});
};
