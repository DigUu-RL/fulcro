import type { AlignedElement } from '@/element';
import type { LinearMemory } from '@/linearMemory';
import type { MemoryReference } from '@/memoryReference';

/**
 * A byte address inside a {@link LinearMemory}, and the type of the value
 * stored there.
 *
 * ```ts
 * const particle: NativePointer<Particle> = nativePointerTo(memory, 64, Particle);
 * const velocity: NativePointer<Point> = particle.at(
 * 	Particle.layout.fields.velocity.offset,
 * 	Point,
 * );
 *
 * velocity.set(Point.from({ x: 0, y: -9.8 })); // writes the particle, in place
 * ```
 *
 * Where a {@link Pointer} counts values, this counts bytes: it can point into
 * the middle of a value, at one of its fields, and read the same bytes as
 * another type. It owns nothing; the memory stays its owner's.
 *
 * A pointer made from an allocation reaches only the allocation's bytes, and
 * refuses every access once its allocator released them. A pointer made from a
 * memory and an address reaches the whole memory, and no allocator watches
 * over it.
 *
 * @template T Type of the value at the address.
 */
export interface NativePointer<T> extends MemoryReference<T> {
	/** The memory the address is in. */
	readonly memory: LinearMemory;

	/** Byte offset from the first byte of the memory. */
	readonly address: number;

	/**
	 * Reads the value at the address, from the bytes as they are now.
	 *
	 * @returns The value.
	 * @throws {RangeError} When the value's bytes run past the end of where
	 * the pointer may read.
	 * @throws {Error} When the pointer was made from an allocation its
	 * allocator released.
	 */
	get(): T;

	/**
	 * Writes a value at the address.
	 *
	 * @param value The value to store there.
	 * @throws {TypeError} When the value is not one of the pointer's type.
	 * @throws {RangeError} When the value's bytes run past the end of where
	 * the pointer may write.
	 * @throws {Error} When the pointer was made from an allocation its
	 * allocator released.
	 */
	set(value: T): void;

	/**
	 * Points a number of bytes further into the same memory, or back, at a
	 * value of the same type.
	 *
	 * @param byteOffset How many bytes to move, negative to move back.
	 * @returns A pointer at `address + byteOffset`.
	 * @throws {RangeError} When that address is outside where the pointer may
	 * point, or is not aligned for the type.
	 */
	at(byteOffset: number): NativePointer<T>;

	/**
	 * Points a number of bytes further into the same memory, or back, and reads
	 * what is there as another type: a field of a struct, or the same bytes
	 * seen differently.
	 *
	 * @template TOther Type of the value at the new address.
	 * @param byteOffset How many bytes to move; `0` to stay.
	 * @param element Type of the value there.
	 * @returns A pointer at `address + byteOffset`.
	 * @throws {TypeError} When the element type cannot be stored as bytes.
	 * @throws {RangeError} When that address is outside where the pointer may
	 * point, or is not aligned for the type.
	 */
	at<TOther>(
		byteOffset: number,
		element: AlignedElement<TOther>,
	): NativePointer<TOther>;
}
