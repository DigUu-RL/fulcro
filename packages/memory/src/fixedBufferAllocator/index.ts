import { createError } from '@fulcro/errors';

import type { Allocation, Allocator } from '@/allocator';
import { requireRequest } from '@/allocator/requireRequest';
import { bump, type BumpRegion, remaining } from '@/bump';
import { describeBuffer } from '@/storage/describeBuffer';

/**
 * An allocator over a buffer the caller supplied, handed out front to back and
 * taken back all at once.
 */
export interface FixedBufferAllocator extends Allocator {
	/**
	 * Releases every allocation made so far, at once, and starts again from the
	 * front of the buffer. Every allocation made before it reports `isLive()` as
	 * `false` from now on.
	 */
	reset(): void;
}

/**
 * Creates an allocator over a buffer you already have, which never asks the
 * engine for memory of its own.
 *
 * ```ts
 * const memory = new ArrayBuffer(4096);
 * const allocator: FixedBufferAllocator = createFixedBufferAllocator(memory);
 *
 * const header = allocator.allocate(16, 8);
 * const body = allocate(Sample, 128, allocator);
 * ```
 *
 * For a budget fixed in advance: every allocation comes out of the buffer, a
 * request it has no room for is refused, and `reset` makes all of it
 * available again. The buffer is the allocator's from now on; what it held
 * before is overwritten with zeroes as it is handed out.
 *
 * @param buffer The memory to hand out.
 * @returns The allocator, frozen.
 * @throws {TypeError} When `buffer` is not an `ArrayBuffer`.
 */
export const createFixedBufferAllocator = (
	buffer: ArrayBuffer,
): FixedBufferAllocator => {
	if (!(buffer instanceof ArrayBuffer)) {
		throw createError('FULCRO7013', {
			operation: 'createFixedBufferAllocator',
			received: describeBuffer(buffer),
		});
	}

	const region: BumpRegion = { buffer, offset: 0 };

	// As in the arena: releasing everything is one increment, and each
	// allocation is live while the generation it was made in lasts.
	let generation = 0;

	return Object.freeze({
		allocate: (size: number, alignment: number): Allocation => {
			requireRequest('FixedBufferAllocator.allocate', size, alignment);

			const bytes: DataView | undefined = bump(region, size, alignment);

			if (bytes === undefined) {
				throw createError('FULCRO7007', {
					operation: 'FixedBufferAllocator.allocate',
					requested: size,
					alignment,
					available: remaining(region),
					capacity: buffer.byteLength,
				});
			}

			const made: number = generation;

			return Object.freeze({
				bytes,
				isLive: (): boolean => generation === made,
			});
		},

		reset: (): void => {
			generation++;
			region.offset = 0;
		},
	});
};
