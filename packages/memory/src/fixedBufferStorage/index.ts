import { createByteStorage } from '@/byteStorage';
import { type FixedLayoutElement, requireElement } from '@/element';
import type { Storage } from '@/storage';
import { requireLength } from '@/storage/requireLength';

/**
 * Creates a storage held in one buffer of fixed size: every value stored as
 * its bytes, end to end, behind the {@link Storage} contract.
 *
 * ```ts
 * const Point = struct('Point', {
 * 	x: SinglePrecisionFloat,
 * 	y: SinglePrecisionFloat,
 * });
 *
 * const points: Storage<Struct<typeof Point>> = createFixedBufferStorage(
 * 	Point,
 * 	1_000,
 * );
 *
 * points.set(0, Point.from({ x: 1, y: 2 }));
 * points.get(0).x; // 1
 * ```
 *
 * The buffer is allocated once, `length × element.layout.size` bytes, and
 * starts zeroed, so every position reads as the element type's zero value until
 * it is set. Nothing is made at creation: a value is materialised when it is
 * read, a new one on every `get`, and holding a million of them costs the
 * bytes and not a million objects.
 *
 * `set` refuses a value the element type does not recognise as its own, before
 * a byte is written.
 *
 * @param element Type of the values: a struct, or anything with its shape.
 * @param length How many values it holds, fixed from now on.
 * @returns The storage, frozen.
 * @throws {TypeError} When the element type lacks a name, a layout size, or
 * `read`, `write` or `is`.
 * @throws {RangeError} When the length is not a non-negative safe integer.
 */
export const createFixedBufferStorage = <T>(
	element: FixedLayoutElement<T>,
	length: number,
): Storage<T> => {
	requireElement('createFixedBufferStorage', element);
	requireLength('createFixedBufferStorage', length);

	const view = new DataView(new ArrayBuffer(length * element.layout.size));

	return createByteStorage(element, length, view, {
		get: 'FixedBufferStorage.get',
		set: 'FixedBufferStorage.set',
	});
};
