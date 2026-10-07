import type { MemoryReference } from '@/memoryReference';
import type { Pointer } from '@/pointer';
import { createView } from '@/region';
import { cutRegion } from '@/region/cutRegion';
import type { Storage } from '@/storage';
import type { View } from '@/view';

/**
 * Observes a region of a storage, a view or an array, copying nothing.
 *
 * ```ts
 * const readings = createFixedBufferStorage(Reading, 1_000);
 * const lastHundred: View<Struct<typeof Reading>> = asView(readings, 900);
 *
 * lastHundred.set(0, Reading.from({ value: 1.5 })); // writes readings[900]
 * ```
 *
 * Nothing is read when the view is made, however long it is. Every `get` and
 * `set` reads or writes the source, so the view and the source always agree.
 *
 * An array is observed in place. It can shrink afterwards, which a storage
 * cannot: a position the array no longer reaches is refused rather than read
 * as `undefined`.
 *
 * @template T Type of the values.
 * @param source What to observe.
 * @param start Where the region begins, from `0` to the source's length; `0`
 * when omitted.
 * @param length How many values it observes; the rest of the source when
 * omitted.
 * @returns The view, frozen.
 * @throws {TypeError} When the source is none of those, or has no `set`.
 * @throws {RangeError} When the region does not fit inside the source.
 */
export function asView<T>(
	source: Storage<T> | T[],
	start?: number,
	length?: number,
): View<T>;

/**
 * Observes the region that starts where a pointer points, copying nothing.
 *
 * ```ts
 * const cursor = pointerTo(readings, 10);
 * const next: View<number> = asView(cursor, 5); // readings 10 to 14
 * ```
 *
 * @template T Type of the values.
 * @param source Where the region begins.
 * @param length How many values it observes; `1` when omitted.
 * @returns The view, frozen.
 * @throws {RangeError} When the region runs past the end of the pointer's
 * source.
 */
export function asView<T>(source: Pointer<T>, length?: number): View<T>;

/**
 * Observes the one value of a reference, as a view of length `1`.
 *
 * ```ts
 * const total = referenceTo(0);
 *
 * asView(total).set(0, 10);
 * total.get(); // 10
 * ```
 *
 * @template T Type of the value.
 * @param source The reference.
 * @returns The view, frozen.
 * @throws {TypeError} When the reference has no `set`.
 */
export function asView<T>(source: MemoryReference<T>): View<T>;

export function asView<T>(
	source: Storage<T> | T[] | Pointer<T> | MemoryReference<T>,
	first?: number,
	second?: number,
): View<T> {
	const {
		source: values,
		start,
		length,
	} = cutRegion<T>('asView', source, 'write', first, second);

	return createView(values, start, length);
}
