import type { Allocation, AllocationDomain } from '@/allocator';
import { requireRequest, requireSize } from '@/allocator/requireRequest';
import { bump, type BumpRegion } from '@/bump';

/**
 * An allocator that hands memory out front to back and takes all of it back
 * at once.
 *
 * Also an {@link AllocationDomain}: entered with `using`, it is reset when the
 * scope ends.
 */
export interface ArenaAllocator extends AllocationDomain {
	/**
	 * Releases every allocation made so far, at once, keeping the memory for
	 * the next ones. Every allocation made before it reports `isLive()` as
	 * `false` from now on.
	 */
	reset(): void;
}

/**
 * Creates an arena: memory reserved in chunks, handed out front to back, and
 * released all together.
 *
 * ```ts
 * const arena: ArenaAllocator = createArenaAllocator(64 * 1024);
 *
 * for (const request of requests) {
 * 	const scratch = allocate(Sample, request.length, arena);
 * 	// …
 * 	arena.reset();
 * }
 * ```
 *
 * For many allocations that end together — the work of one request, one
 * frame, one pass. Nothing is released one at a time; `reset` or leaving a
 * `using` scope releases them all, and the chunks are kept, so the next pass
 * allocates without asking the engine for memory again.
 *
 * It grows: when a chunk is full, the next one is taken, and a new one of
 * `chunkSize` bytes is made when there is none — or one exactly as large as
 * the request, when the request is larger than a chunk.
 *
 * @param chunkSize Bytes reserved at a time.
 * @returns The arena, frozen.
 * @throws {RangeError} When the chunk size is not a non-negative safe integer.
 */
export const createArenaAllocator = (chunkSize: number): ArenaAllocator => {
	requireSize('createArenaAllocator', chunkSize);

	const chunks: ArrayBuffer[] = [];
	let current = -1;
	let region: BumpRegion | undefined;

	// Every allocation remembers the generation it was made in, and is live
	// while the arena is still in it: releasing everything is one increment,
	// whatever was allocated.
	let generation = 0;

	const reset = (): void => {
		generation++;
		current = -1;
		region = undefined;
	};

	return Object.freeze({
		allocate: (size: number, alignment: number): Allocation => {
			requireRequest('ArenaAllocator.allocate', size, alignment);

			let bytes: DataView | undefined =
				region === undefined ? undefined : bump(region, size, alignment);

			while (bytes === undefined) {
				current++;

				if (current === chunks.length) {
					chunks.push(new ArrayBuffer(Math.max(chunkSize, size)));
				}

				region = { buffer: chunks[current] as ArrayBuffer, offset: 0 };
				bytes = bump(region, size, alignment);
			}

			const made: number = generation;

			return Object.freeze({
				bytes,
				isLive: (): boolean => generation === made,
			});
		},

		reset,

		[Symbol.dispose]: reset,
	});
};
