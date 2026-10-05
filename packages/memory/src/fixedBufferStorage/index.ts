import { createError } from '@fulcro/errors';

import type { Storage } from '@/storage';
import { requireIndex } from '@/storage/requireIndex';
import { requireLength } from '@/storage/requireLength';

/**
 * What a fixed buffer stores its values with: a type that occupies a known
 * number of bytes and reads and writes itself at an offset.
 *
 * Stated by its shape rather than imported, so this package depends on no
 * type system: every struct `@fulcro/types` declares already has this shape,
 * and any other type that grows it is accepted without this module changing.
 *
 * @template T Type of the values.
 */
interface FixedLayoutElement<T> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/** How many bytes one value occupies, padding to the next one included. */
	readonly layout: { readonly size: number };

	/**
	 * Reads a value from bytes.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts.
	 * @returns The value.
	 */
	read(view: DataView, offset: number): T;

	/**
	 * Writes a value into bytes.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts.
	 * @param value Value to write.
	 */
	write(view: DataView, offset: number, value: T): void;

	/**
	 * Tells whether a value is one of this type's.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is T;
}

/**
 * Names the first part of {@link FixedLayoutElement} a value lacks.
 *
 * @param element Value handed in as the element type.
 * @returns The missing part, or `undefined` when nothing is missing.
 */
const missingPart = (element: unknown): string | undefined => {
	if (typeof element !== 'object' || element === null) return 'everything';

	const candidate = element as Partial<Record<string, unknown>>;
	const layout = candidate.layout as { size?: unknown } | null | undefined;

	if (typeof candidate.name !== 'string') return 'name';
	if (
		typeof layout !== 'object' ||
		layout === null ||
		!Number.isSafeInteger(layout.size) ||
		(layout.size as number) <= 0
	) {
		return 'layout.size';
	}

	return ['read', 'write', 'is'].find(
		(method) => typeof candidate[method] !== 'function',
	);
};

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
	const missing: string | undefined = missingPart(element);

	if (missing !== undefined) {
		throw createError('FULCRO7003', 'createFixedBufferStorage', missing);
	}

	requireLength('createFixedBufferStorage', length);

	const { size } = element.layout;
	const view = new DataView(new ArrayBuffer(length * size));

	return Object.freeze({
		length,

		get: (index: number): T => {
			requireIndex('FixedBufferStorage.get', index, length);

			return element.read(view, index * size);
		},

		set: (index: number, value: T): void => {
			requireIndex('FixedBufferStorage.set', index, length);

			if (!element.is(value)) {
				throw createError('FULCRO7004', 'FixedBufferStorage.set', element.name);
			}

			element.write(view, index * size, value);
		},
	});
};
