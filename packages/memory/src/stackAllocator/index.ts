import { createError } from '@fulcro/errors';

import type { Allocation, AllocationDomain, Allocator } from '@/allocator';
import { requireRequest, requireSize } from '@/allocator/requireRequest';
import { bump, type BumpRegion, remaining } from '@/bump';

/**
 * An allocator over one buffer, released in frames, last in first out.
 *
 * Allocating from the stack itself reserves memory that lasts as long as the
 * stack. Allocating from a frame reserves memory that lasts as long as the
 * frame.
 */
export interface StackAllocator extends Allocator {
	/**
	 * Opens a frame on top of the stack. Leaving it — at the end of its `using`
	 * scope — releases every allocation made through it, at once, and puts the
	 * stack back where the frame found it.
	 *
	 * Only the innermost open frame may allocate or be left; a frame below it
	 * is refused until it is left first, which `using` scopes do on their own.
	 *
	 * @returns The frame.
	 */
	enter(): AllocationDomain;
}

/** One frame of the stack, the stack itself being frame `0`. */
interface Frame {
	/** How many frames sit below it. */
	readonly depth: number;

	/** Where the stack stood when it was entered. */
	readonly mark: number;

	/** `false` once it was left; never `true` again. */
	live: boolean;
}

/**
 * Creates a stack: one buffer of fixed size, allocated front to back, and
 * released a frame at a time.
 *
 * ```ts
 * const stack: StackAllocator = createStackAllocator(1024 * 1024);
 *
 * const step = (): void => {
 * 	using frame = stack.enter();
 * 	const particles = allocate(Particle, 10_000, frame);
 * 	// …
 * }; // the particles are released here
 * ```
 *
 * For work that nests — a call that allocates, calling one that allocates —
 * where what is allocated inside ends before what is allocated outside. The
 * buffer is allocated once, at creation, and never grows; a request it has no
 * room for is refused.
 *
 * @param capacity Size of the buffer, in bytes.
 * @returns The stack, frozen.
 * @throws {RangeError} When the capacity is not a non-negative safe integer.
 */
export const createStackAllocator = (capacity: number): StackAllocator => {
	requireSize('createStackAllocator', capacity);

	const region: BumpRegion = { buffer: new ArrayBuffer(capacity), offset: 0 };
	const frames: Frame[] = [{ depth: 0, mark: 0, live: true }];

	/**
	 * Refuses a frame that is not the innermost one still open.
	 *
	 * @param operation Operation being performed, for the error message.
	 * @param frame Frame being used.
	 */
	const requireInnermost = (operation: string, frame: Frame): void => {
		const innermost = frames[frames.length - 1] as Frame;

		if (innermost !== frame) {
			throw createError('FULCRO7008', {
				operation,
				depth: frame.depth,
				innermost: innermost.depth,
			});
		}
	};

	/**
	 * Reserves bytes on top of the stack, on behalf of a frame.
	 *
	 * @param operation Operation being performed, for the error message.
	 * @param frame Frame the allocation belongs to.
	 * @param size How many bytes.
	 * @param alignment Power of two the start must be a multiple of.
	 * @returns The allocation, live as long as the frame.
	 */
	const allocateIn = (
		operation: string,
		frame: Frame,
		size: number,
		alignment: number,
	): Allocation => {
		requireRequest(operation, size, alignment);

		if (!frame.live) {
			throw createError('FULCRO7012', { operation, depth: frame.depth });
		}

		requireInnermost(operation, frame);

		const bytes: DataView | undefined = bump(region, size, alignment);

		if (bytes === undefined) {
			throw createError('FULCRO7007', {
				operation,
				requested: size,
				alignment,
				available: remaining(region),
				capacity,
			});
		}

		return Object.freeze({ bytes, isLive: (): boolean => frame.live });
	};

	return Object.freeze({
		allocate: (size: number, alignment: number): Allocation =>
			allocateIn(
				'StackAllocator.allocate',
				frames[0] as Frame,
				size,
				alignment,
			),

		enter: (): AllocationDomain => {
			const frame: Frame = {
				depth: frames.length,
				mark: region.offset,
				live: true,
			};

			frames.push(frame);

			return Object.freeze({
				allocate: (size: number, alignment: number): Allocation =>
					allocateIn('StackAllocator.enter().allocate', frame, size, alignment),

				// Leaving twice is leaving once, as for any disposable: the second
				// call finds nothing left to release.
				[Symbol.dispose]: (): void => {
					if (!frame.live) return;

					requireInnermost('StackAllocator.enter()[Symbol.dispose]', frame);

					frame.live = false;
					frames.pop();
					region.offset = frame.mark;
				},
			});
		},
	});
};
