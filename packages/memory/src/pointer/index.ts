import type { MemoryReference } from '@/memoryReference';

/**
 * One position inside a storage or an array: where a single value is.
 *
 * ```ts
 * const readings = createManagedStorage(4, 0);
 * let cursor: Pointer<number> = pointerTo(readings, 0);
 *
 * cursor.set(7);
 * cursor = cursor.offset(1);
 * cursor.index; // 1
 * ```
 *
 * A pointer may sit one past the last value, so a loop can step onto the end
 * and stop there; only reading or writing it there is refused. Moving it makes
 * a new pointer into the same source, and the one it came from is unchanged.
 *
 * A pointer is a {@link MemoryReference} to the value it points at, and
 * `asView(pointer, length)` observes the region starting there.
 *
 * @template T Type of the values in its source.
 */
export interface Pointer<T> extends MemoryReference<T> {
	/** Position in its source, from `0` to the source's length. */
	readonly index: number;

	/**
	 * Reads the value the pointer points at.
	 *
	 * @returns The value.
	 * @throws {RangeError} When the pointer sits past the last value.
	 * @throws {Error} When the memory of its source was released.
	 */
	get(): T;

	/**
	 * Replaces the value the pointer points at.
	 *
	 * @param value The value to hold there.
	 * @throws {RangeError} When the pointer sits past the last value.
	 * @throws {Error} When the memory of its source was released.
	 */
	set(value: T): void;

	/**
	 * Points further into the same source, or back.
	 *
	 * @param delta How many positions to move, negative to move back.
	 * @returns A pointer at `index + delta`.
	 * @throws {RangeError} When that position is outside `0` to the source's
	 * length.
	 */
	offset(delta: number): Pointer<T>;
}
