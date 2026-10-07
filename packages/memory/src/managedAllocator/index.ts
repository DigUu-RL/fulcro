import type { Allocation, Allocator } from '@/allocator';
import { requireRequest } from '@/allocator/requireRequest';

/** Answers that memory the garbage collector owns is live while it is held. */
const always = (): boolean => true;

/**
 * Creates an allocator over memory the JavaScript engine manages: every
 * allocation its own buffer, reclaimed by the garbage collector once nothing
 * holds it.
 *
 * ```ts
 * const allocator: Allocator = createManagedAllocator();
 * const samples = allocate(Sample, 44_100, allocator);
 * ```
 *
 * The strategy to pass when nothing about the situation calls for another:
 * nothing is ever released early, so an allocation is live for as long as it
 * is reachable, and nothing has to be released by hand. What it costs is one
 * buffer per allocation, and the garbage collector's work to reclaim each one.
 *
 * @returns The allocator, frozen.
 */
export const createManagedAllocator = (): Allocator =>
	Object.freeze({
		allocate: (size: number, alignment: number): Allocation => {
			requireRequest('ManagedAllocator.allocate', size, alignment);

			// A buffer of its own starts at offset zero, which every alignment
			// divides, so the alignment needs checking and nothing more.
			return Object.freeze({
				bytes: new DataView(new ArrayBuffer(size)),
				isLive: always,
			});
		},
	});
