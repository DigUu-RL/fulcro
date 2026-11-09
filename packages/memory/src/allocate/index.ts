import type { Allocation, Allocator } from '@/src/allocator';
import { requireAlignment } from '@/src/allocator/requireRequest';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import {
	createLaidOutStorage,
	type DataLayout,
	type LayoutStrategy,
	strategyOf,
} from '@/src/dataLayout';
import { type AlignedElement, requireElement } from '@/src/element';
import { type FieldBytes, fieldBytesOf } from '@/src/element/fieldBytes';
import type { Storage } from '@/src/storage';
import { requireLength } from '@/src/storage/requireLength';

/**
 * Allocates a storage of values from the allocator the caller chose.
 *
 * ```ts
 * const BlasterBolt = struct('BlasterBolt', {
 * 	heat: SinglePrecisionFloat,
 * 	speed: SinglePrecisionFloat,
 * });
 *
 * {
 * 	using frame = stack.enter();
 * 	const bolts: Storage<Struct<typeof BlasterBolt>> = allocate(
 * 		BlasterBolt,
 * 		10_000,
 * 		frame,
 * 	);
 *
 * 	bolts.set(0, BlasterBolt.from({ heat: 1, speed: 0.5 }));
 * }
 * ```
 *
 * The values are held as their bytes, exactly as in `createFixedBufferStorage`
 * and in the layout it names — what changes is only where the bytes come from.
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
 * @param layout How the bytes are arranged; `ArrayOfStructures` when omitted.
 * @returns The storage, frozen.
 * @throws {TypeError} When the element type lacks a name, a layout size, or
 * `read`, `write` or `is`, when its fields overlap, or when the layout is not
 * `ArrayOfStructures` or `StructureOfArrays`.
 * @throws {RangeError} When the length is not a non-negative safe integer, the
 * element's alignment is not a power of two, or the allocator has no room.
 */
export const allocate = <T>(
	element: AlignedElement<T>,
	length: number,
	allocator: Allocator,
	layout: DataLayout = ArrayOfStructures,
): Storage<T> => {
	requireElement('allocate', element);
	requireLength('allocate', length);
	requireAlignment('allocate', element.layout.alignment);

	const strategy: LayoutStrategy = strategyOf('allocate', layout);
	const fields: readonly FieldBytes[] | undefined = fieldBytesOf('allocate', element);

	// One allocation for every column, aligned to the element: a column starts
	// at `length × offset` of its field, a multiple of that field's alignment
	// whenever its offset is, so it lands aligned as well.
	const allocation: Allocation = allocator.allocate(
		strategy.byteLength(element, fields, length),
		element.layout.alignment,
	);

	return createLaidOutStorage(
		strategy,
		element,
		{ element, fields, length, view: allocation.bytes, layout, allocation },
		{ get: 'Storage.get', set: 'Storage.set' },
	);
};
