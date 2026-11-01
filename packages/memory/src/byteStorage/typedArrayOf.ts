import { platformIsLittleEndian } from '@/src/byteStorage/platformEndianness';
import type { FixedLayoutElement } from '@/src/element';

/**
 * The values of a typed array, seen without the type of its elements: what a
 * storage reads and writes once it holds its values in one.
 */
export interface TypedElements {
	/** How many elements it reaches — `0` once its buffer shrank or was detached. */
	readonly length: number;

	[index: number]: unknown;
}

/** What every typed array constructor has that a storage needs. */
interface TypedElementsConstructor {
	readonly BYTES_PER_ELEMENT: number;

	new (buffer: ArrayBufferLike, byteOffset: number, length: number): TypedElements;
}

/**
 * The typed array of each encoding the language has one for, by the name an
 * element type's `layout.encoding` gives it.
 *
 * `'Float16'` is left out, as are the 128-bit encodings: Node 22, the oldest
 * line this package supports, has no `Float16Array`, and where one exists it
 * writes a `NaN` in a bit pattern of the engine's choosing, while a half
 * precision type writes one it chose itself — so the bytes could differ.
 */
const TYPED_ARRAYS: ReadonlyMap<string, TypedElementsConstructor> = new Map<
	string,
	TypedElementsConstructor
>([
	['Int8', Int8Array],
	['Uint8', Uint8Array],
	['Int16', Int16Array],
	['Uint16', Uint16Array],
	['Int32', Int32Array],
	['Uint32', Uint32Array],
	['BigInt64', BigInt64Array],
	['BigUint64', BigUint64Array],
	['Float32', Float32Array],
	['Float64', Float64Array],
]);

/**
 * The typed array a storage can hold its values in, over the bytes it was
 * handed: chosen once, when the storage is made, so no access tests which kind
 * of element it holds.
 *
 * There is none — and the storage reads and writes through the element — when
 * the element names no encoding with a typed array behind it, when its size
 * carries padding the typed array would not, when the bytes do not start on a
 * multiple of the size, as a typed array requires, or when the platform is not
 * little-endian and the size is more than one byte.
 *
 * @param layout Layout of the element type, already checked.
 * @param length How many values the storage holds.
 * @param view Bytes it holds them in, at least `length × layout.size`.
 * @returns The typed array over exactly those bytes, or `undefined`.
 */
export const typedArrayOf = (
	layout: FixedLayoutElement<unknown>['layout'],
	length: number,
	view: DataView,
): TypedElements | undefined => {
	const { size, encoding } = layout;

	if (typeof encoding !== 'string') return undefined;

	const TypedArray: TypedElementsConstructor | undefined = TYPED_ARRAYS.get(encoding);

	if (TypedArray?.BYTES_PER_ELEMENT !== size) return undefined;
	if (size > 1 && !platformIsLittleEndian) return undefined;
	if (view.byteOffset % size !== 0) return undefined;

	return new TypedArray(view.buffer, view.byteOffset, length);
};
