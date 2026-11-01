import { createError } from '@fulcro/errors';

import type { Allocation, AllocationDomain, Allocator } from '@/src/allocator';
import { requireRequest } from '@/src/allocator/requireRequest';
import { bump, type BumpRegion } from '@/src/bump';

/**
 * An allocator over memory the JavaScript engine manages, which can also lend
 * memory for the length of a scope.
 *
 * Allocating from the allocator itself gives memory that lives as long as it
 * is reachable. Allocating from a frame gives memory that lives as long as the
 * frame, and that the next frame may reuse — which is what spares the garbage
 * collector a buffer per allocation.
 */
export interface ManagedAllocator extends Allocator {
	/**
	 * Opens a frame. Leaving it — at the end of its `using` scope — releases
	 * every allocation made through it, at once.
	 *
	 * Unlike a stack's, a frame here never refuses a request: what does not fit
	 * the memory the allocator reuses gets a buffer of its own, as an
	 * allocation from the allocator would. Frames may be left in any order; the
	 * memory of one left early is reused once every frame opened after it is
	 * left too.
	 *
	 * @returns The frame.
	 */
	readonly enter: () => AllocationDomain;
}

/** Answers that memory the garbage collector owns is live while it is held. */
const always = (): boolean => true;

/** One open frame, and where the reused memory stood when it was opened. */
interface Frame {
	/** How many frames were open below it, plus one. */
	readonly depth: number;

	/** Offset of the reused region when it was entered. */
	readonly mark: number;

	/** What the region would have reached by then, had everything fitted. */
	readonly wantedMark: number;

	/** `false` once it was left; never `true` again. */
	live: boolean;
}

/**
 * The next offset of a run of bytes, aligned the way `bump` aligns it.
 *
 * @param offset Where the run stands.
 * @param size How many bytes are added.
 * @param alignment Power of two the start must be a multiple of.
 * @returns Where the run stands after them.
 */
const advance = (offset: number, size: number, alignment: number): number => {
	return Math.ceil(offset / alignment) * alignment + size;
};

/**
 * Creates an allocator over memory the JavaScript engine manages: every
 * allocation its own buffer, reclaimed by the garbage collector once nothing
 * holds it.
 *
 * ```ts
 * const allocator: ManagedAllocator = createManagedAllocator();
 * const samples = allocate(Sample, 44_100, allocator);
 * ```
 *
 * The strategy to pass when nothing about the situation calls for another:
 * nothing allocated from it is ever released early, so an allocation is live
 * for as long as it is reachable, and nothing has to be released by hand. What
 * it costs is one buffer per allocation, and the garbage collector's work to
 * reclaim each one.
 *
 * A scope that knows its memory ends with it can say so through a frame:
 *
 * ```ts
 * const step = (): void => {
 * 	using frame = allocator.enter();
 * 	const particles = allocate(Particle, 10_000, frame);
 * 	// …
 * }; // the particles are released here, and the next step reuses their bytes
 * ```
 *
 * The frames share one region, made when the outermost frame is left and
 * sized for the most the frames ever held at once; until then, and for
 * whatever outgrows it, a frame hands out buffers of its own. `@fulcro/memory`'s
 * transformer opens such frames itself, around an allocation it can prove does
 * not outlive its scope.
 *
 * @returns The allocator, frozen.
 */
export const createManagedAllocator = (): ManagedAllocator => {
	// Made lazily, so an allocator nobody opens a frame on costs nothing.
	let region: BumpRegion | undefined;
	const frames: Frame[] = [];

	/** Where the region would stand had every request of a frame fitted. */
	let wanted = 0;

	/** The most `wanted` reached since no frame was open. */
	let peak = 0;

	/**
	 * Reserves bytes for a frame: from the region when the frame is the
	 * innermost one and the region has room, in a buffer of its own otherwise.
	 *
	 * A frame below the innermost one never takes from the region: what it
	 * took would sit above the inner frame's bytes, and leaving the inner frame
	 * would hand them out again.
	 *
	 * @param frame Frame the allocation belongs to.
	 * @param size How many bytes.
	 * @param alignment Power of two the start must be a multiple of.
	 * @returns The allocation, live as long as the frame.
	 */
	const allocateIn = (frame: Frame, size: number, alignment: number): Allocation => {
		const operation = 'ManagedAllocator.enter().allocate';

		requireRequest(operation, size, alignment);

		if (!frame.live) {
			throw createError('FULCRO7012', { operation, depth: frame.depth });
		}

		const innermost: boolean = frames[frames.length - 1] === frame;

		if (innermost) {
			wanted = advance(wanted, size, alignment);
			peak = Math.max(peak, wanted);
		}

		const bytes: DataView =
			(innermost && region !== undefined ? bump(region, size, alignment) : undefined) ??
			new DataView(new ArrayBuffer(size));

		return Object.freeze({ bytes, isLive: (): boolean => frame.live });
	};

	/**
	 * Leaves a frame, and gives the region back as far as every frame above
	 * the point allows.
	 *
	 * @param frame Frame being left.
	 */
	const leave = (frame: Frame): void => {
		frame.live = false;

		// A frame left before one opened after it keeps its bytes until that one
		// is left too: they sit below the other frame's, which are still in use.
		for (let top = frames.at(-1); top !== undefined && !top.live; top = frames.at(-1)) {
			frames.pop();

			if (region !== undefined) region.offset = top.mark;

			wanted = top.wantedMark;
		}

		if (frames.length > 0) return;

		// Replaced only with no frame open, so no live allocation is in it.
		if (peak > (region?.buffer.byteLength ?? 0)) {
			region = { buffer: new ArrayBuffer(peak), offset: 0 };
		}

		peak = 0;
	};

	return Object.freeze({
		allocate: (size: number, alignment: number): Allocation => {
			requireRequest('ManagedAllocator.allocate', size, alignment);

			// A buffer of its own starts at offset zero, which every alignment
			// divides, so the alignment needs checking and nothing more.
			return Object.freeze({
				bytes: new DataView(new ArrayBuffer(size)),
				isLive: always,
			});
		},

		enter: (): AllocationDomain => {
			const frame: Frame = {
				depth: frames.length + 1,
				mark: region?.offset ?? 0,
				wantedMark: wanted,
				live: true,
			};

			frames.push(frame);

			return Object.freeze({
				allocate: (size: number, alignment: number): Allocation => {
					return allocateIn(frame, size, alignment);
				},

				// Leaving twice is leaving once, as for any disposable: the second
				// call finds nothing left to release.
				[Symbol.dispose]: (): void => {
					if (frame.live) leave(frame);
				},
			});
		},
	});
};
