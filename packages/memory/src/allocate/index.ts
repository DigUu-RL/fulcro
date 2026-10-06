import type { Allocation, Allocator } from '@/allocator';
import { requireAlignment } from '@/allocator/requireRequest';
import { createByteStorage } from '@/byteStorage';
import { type AlignedElement, requireElement } from '@/element';
import type { Storage } from '@/storage';
import { requireLength } from '@/storage/requireLength';

/**
 * Allocates a storage of values from the allocator the caller chose.
 *
 * ```ts
 * const Particle = struct('Particle', {
 * 	x: SinglePrecisionFloat,
 * 	y: SinglePrecisionFloat,
 * });
 *
 * {
 * 	using frame = stack.enter();
 * 	const particles: Storage<Struct<typeof Particle>> = allocate(
 * 		Particle,
 * 		10_000,
 * 		frame,
 * 	);
 *
 * 	particles.set(0, Particle.from({ x: 1, y: 2 }));
 * }
 * ```
 *
 * The values are held as their bytes, end to end, exactly as in
 * `createFixedBufferStorage` — what changes is only where the bytes come from.
 * They start zeroed, so every position reads as the element type's zero value
 * until it is set.
 *
 * The storage lives no longer than its memory. Once the allocator releases it
 * — an arena reset, a frame left, a block returned — every `get` and `set`
 * throws rather than read values that are not its own any more.
 *
 * @param element Type of the values: a struct, or anything with its shape and
 * a layout alignment.
 * @param length How many values it holds, fixed from now on.
 * @param allocator Where the memory comes from.
 * @returns The storage, frozen.
 * @throws {TypeError} When the element type lacks a name, a layout size, or
 * `read`, `write` or `is`.
 * @throws {RangeError} When the length is not a non-negative safe integer, the
 * element's alignment is not a power of two, or the allocator has no room.
 */
export const allocate = <T>(
	element: AlignedElement<T>,
	length: number,
	allocator: Allocator,
): Storage<T> => {
	requireElement('allocate', element);
	requireLength('allocate', length);
	requireAlignment('allocate', element.layout.alignment);

	const allocation: Allocation = allocator.allocate(
		length * element.layout.size,
		element.layout.alignment,
	);

	return createByteStorage(
		element,
		length,
		allocation.bytes,
		{ get: 'Storage.get', set: 'Storage.set' },
		allocation,
	);
};
