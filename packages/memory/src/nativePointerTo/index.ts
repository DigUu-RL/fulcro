import { createError } from '@fulcro/errors';

import type { Allocation } from '@/allocator';
import { requireAlignment } from '@/allocator/requireRequest';
import { type AlignedElement, requireElement } from '@/element';
import {
	bytesOf,
	isLinearMemory,
	type LinearMemory,
	openLinearMemory,
} from '@/linearMemory';
import type { NativePointer } from '@/nativePointer';
import { describeBuffer } from '@/storage/describeBuffer';
import { describeValue } from '@/storage/describeValue';

/**
 * Where the pointers made by one call may point, and every pointer moved from
 * them: the whole memory, or one allocation's bytes inside it.
 */
interface Region {
	/** The memory the addresses are in. */
	readonly memory: LinearMemory;

	/** The bytes of the memory, as they are now. */
	readonly bytes: () => DataView;

	/** The first address a pointer may hold. */
	readonly start: number;

	/**
	 * The address after the last byte a pointer may read, given the bytes as
	 * they are now.
	 */
	readonly end: (bytes: DataView) => number;

	/** The allocation the bytes were lent by, when an allocator lent them. */
	readonly allocation: Allocation | undefined;
}

/**
 * Tells whether a value has the shape of an {@link Allocation}.
 *
 * @param value Value to inspect.
 * @returns `true` when it has `bytes` and `isLive`.
 */
const isAllocation = (value: unknown): value is Allocation =>
	typeof value === 'object' &&
	value !== null &&
	(value as Partial<Allocation>).bytes instanceof DataView &&
	typeof (value as Partial<Allocation>).isLive === 'function';

/**
 * Refuses an element type a pointer cannot read and write at an address.
 *
 * @param operation Operation being performed, for the error message.
 * @param element Value handed in as the element type.
 * @throws {TypeError} When it cannot be stored as bytes.
 * @throws {RangeError} When its alignment is not a power of two.
 */
const requirePointerElement = (operation: string, element: unknown): void => {
	requireElement(operation, element);
	requireAlignment(
		operation,
		(element as AlignedElement<unknown>).layout.alignment,
	);
};

/**
 * Refuses an address a pointer into a region cannot hold.
 *
 * The address may be the region's end, one past its last byte, so a pointer
 * can step onto the end of a loop; reading there is refused when it happens.
 *
 * @param operation Operation being performed, for the error message.
 * @param region Where the pointer may point.
 * @param address Address asked for.
 * @param element Type of the value there.
 * @throws {RangeError} When the address is not an integer inside the region,
 * or is not a multiple of the element's alignment.
 */
const requireAddress = (
	operation: string,
	region: Region,
	address: unknown,
	element: AlignedElement<unknown>,
): void => {
	const end: number = region.end(region.bytes());

	if (
		typeof address !== 'number' ||
		!Number.isSafeInteger(address) ||
		address < region.start ||
		address > end
	) {
		throw createError('FULCRO7019', {
			operation,
			address: typeof address === 'number' ? address : describeValue(address),
			start: region.start,
			end,
		});
	}

	if (address % element.layout.alignment !== 0) {
		throw createError('FULCRO7020', {
			operation,
			address,
			alignment: element.layout.alignment,
			element: element.name,
		});
	}
};

/**
 * Builds a pointer at an address already checked.
 *
 * @param region Where it may point.
 * @param address Its address.
 * @param element Type of the value there, already checked.
 * @returns The pointer, frozen.
 */
const createNativePointer = <T>(
	region: Region,
	address: number,
	element: AlignedElement<T>,
): NativePointer<T> => {
	const { size } = element.layout;

	/**
	 * The bytes to read or write the value in, once the access is allowed.
	 *
	 * @param operation Operation being performed, for the error message.
	 * @returns The bytes of the whole memory.
	 */
	const access = (operation: string): DataView => {
		if (region.allocation !== undefined && !region.allocation.isLive()) {
			throw createError('FULCRO7009', { operation });
		}

		const bytes: DataView = region.bytes();
		const end: number = region.end(bytes);

		if (address + size > end) {
			throw createError('FULCRO7021', {
				operation,
				address,
				size,
				element: element.name,
				end,
			});
		}

		return bytes;
	};

	/**
	 * Moves the pointer, keeping its type or taking another.
	 *
	 * @param byteOffset How many bytes to move.
	 * @param other Type of the value at the new address, when it changes.
	 * @returns The pointer there.
	 */
	const at = <TOther>(
		byteOffset: number,
		other?: AlignedElement<TOther>,
	): NativePointer<TOther> => {
		const next: AlignedElement<TOther> =
			other ?? (element as unknown as AlignedElement<TOther>);

		if (other !== undefined) requirePointerElement('NativePointer.at', other);

		const target: unknown =
			typeof byteOffset === 'number' ? address + byteOffset : byteOffset;

		requireAddress('NativePointer.at', region, target, next);

		return createNativePointer(region, target as number, next);
	};

	return Object.freeze({
		memory: region.memory,
		address,

		get: (): T => element.read(access('NativePointer.get'), address),

		set: (value: T): void => {
			const bytes: DataView = access('NativePointer.set');

			if (!element.is(value)) {
				throw createError('FULCRO7004', {
					operation: 'NativePointer.set',
					element: element.name,
				});
			}

			element.write(bytes, address, value);
		},

		at,
	}) as NativePointer<T>;
};

/**
 * Points at a byte address of a linear memory, at a value of the type given.
 *
 * ```ts
 * const memory = createLinearMemory(moduleExports.memory);
 * const latest: NativePointer<Reading> = nativePointerTo(
 * 	memory,
 * 	moduleExports.latest(),
 * 	Reading,
 * );
 *
 * latest.get(); // the reading the module wrote, read in place
 * ```
 *
 * The pointer may reach anywhere in the memory, and no allocator watches over
 * it: the address is trusted to hold a value of the type, the way an address
 * a WebAssembly module returns is. Reach for `nativePointerTo(allocation,
 * element)` when the bytes came from an allocator.
 *
 * @template T Type of the value at the address.
 * @param memory Memory the address is in.
 * @param address Byte offset from its first byte, a multiple of the type's
 * alignment, from `0` to the memory's length.
 * @param element Type of the value there: a struct, or anything with its shape
 * and a layout alignment.
 * @returns The pointer, frozen.
 * @throws {TypeError} When the memory is not one, or the element type cannot be
 * stored as bytes.
 * @throws {RangeError} When the address is outside the memory or is not aligned
 * for the type.
 */
export function nativePointerTo<T>(
	memory: LinearMemory,
	address: number,
	element: AlignedElement<T>,
): NativePointer<T>;

/**
 * Points at the first byte of an allocation, at a value of the type given.
 *
 * ```ts
 * const header = arena.allocate(Header.layout.size, Header.layout.alignment);
 * const pointer: NativePointer<Header> = nativePointerTo(header, Header);
 *
 * pointer.set(Header.from({ version: 2, length: 0 }));
 * arena.reset();
 * pointer.get(); // throws FULCRO7009 — the bytes are the arena's again
 * ```
 *
 * The pointer, and every pointer moved from it, reaches only the allocation's
 * bytes, and asks the allocation whether it is still live before every read
 * and write. Its memory is the buffer the allocator carved the allocation from,
 * and its address is where the allocation starts in it.
 *
 * @template T Type of the value at the start of the allocation.
 * @param allocation Bytes an allocator handed out.
 * @param element Type of the value there: a struct, or anything with its shape
 * and a layout alignment.
 * @returns The pointer, frozen.
 * @throws {TypeError} When the allocation's buffer is shared, or the element
 * type cannot be stored as bytes.
 * @throws {RangeError} When the allocation does not start at a multiple of the
 * type's alignment.
 */
export function nativePointerTo<T>(
	allocation: Allocation,
	element: AlignedElement<T>,
): NativePointer<T>;

export function nativePointerTo<T>(
	target: LinearMemory | Allocation,
	second: number | AlignedElement<T>,
	third?: AlignedElement<T>,
): NativePointer<T> {
	if (isLinearMemory(target)) {
		const element = third as AlignedElement<T>;
		const region: Region = {
			memory: target,
			bytes: () => bytesOf(target),
			start: 0,
			end: (bytes: DataView): number => bytes.byteLength,
			allocation: undefined,
		};

		requirePointerElement('nativePointerTo', element);
		requireAddress('nativePointerTo', region, second, element);

		return createNativePointer(region, second as number, element);
	}

	if (!isAllocation(target)) {
		throw createError('FULCRO7022', {
			operation: 'nativePointerTo',
			received: describeBuffer(target),
		});
	}

	const element = second as AlignedElement<T>;
	const { buffer, byteOffset, byteLength } = target.bytes;
	const memory: LinearMemory = openLinearMemory(
		'nativePointerTo',
		buffer as ArrayBuffer,
	);
	const region: Region = {
		memory,
		bytes: () => bytesOf(memory),
		start: byteOffset,
		// The buffer may have shrunk or been transferred since: then the end is
		// where its bytes stop, and an access past it is refused with a code
		// rather than with the engine's own error.
		end: (bytes: DataView): number =>
			Math.min(byteOffset + byteLength, bytes.byteLength),
		allocation: target,
	};

	requirePointerElement('nativePointerTo', element);
	requireAddress('nativePointerTo', region, byteOffset, element);

	return createNativePointer(region, byteOffset, element);
}
