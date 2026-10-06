import type { MemoryReference } from '@/memoryReference';
import type { Pointer } from '@/pointer';
import { createReadOnlyView } from '@/region';
import { cutRegion } from '@/region/cutRegion';
import type { Storage } from '@/storage';
import type { ReadOnlyView } from '@/view';

/**
 * Observes a region of a storage, a view or an array without the right to
 * write it, copying nothing.
 *
 * ```ts
 * const settings: readonly number[] = [1, 2, 3, 4];
 * const tail: ReadOnlyView<number> = asReadOnlyView(settings, 2);
 *
 * tail.get(0); // 3
 * ```
 *
 * What to hand to code that should only read: the view it returns has no
 * `set`, in its type or at runtime. The values are still the source's, so a
 * write made to the source is seen through the view.
 *
 * @template T Type of the values.
 * @param source What to observe — a read-only view or a read-only array too.
 * @param start Where the region begins, from `0` to the source's length; `0`
 * when omitted.
 * @param length How many values it observes; the rest of the source when
 * omitted.
 * @returns The view, frozen.
 * @throws {TypeError} When the source is none of those.
 * @throws {RangeError} When the region does not fit inside the source.
 */
export function asReadOnlyView<T>(
	source: ReadOnlyView<T> | Storage<T> | readonly T[],
	start?: number,
	length?: number,
): ReadOnlyView<T>;

/**
 * Observes the region that starts where a pointer points, without the right
 * to write it.
 *
 * @template T Type of the values.
 * @param source Where the region begins.
 * @param length How many values it observes; `1` when omitted.
 * @returns The view, frozen.
 * @throws {RangeError} When the region runs past the end of the pointer's
 * source.
 */
export function asReadOnlyView<T>(
	source: Pointer<T>,
	length?: number,
): ReadOnlyView<T>;

/**
 * Observes the one value of a reference, as a read-only view of length `1`.
 *
 * @template T Type of the value.
 * @param source The reference.
 * @returns The view, frozen.
 */
export function asReadOnlyView<T>(source: MemoryReference<T>): ReadOnlyView<T>;

export function asReadOnlyView<T>(
	source:
		| ReadOnlyView<T>
		| Storage<T>
		| readonly T[]
		| Pointer<T>
		| MemoryReference<T>,
	first?: number,
	second?: number,
): ReadOnlyView<T> {
	const {
		source: values,
		start,
		length,
	} = cutRegion<T>('asReadOnlyView', source, 'read', first, second);

	return createReadOnlyView(values, start, length);
}
