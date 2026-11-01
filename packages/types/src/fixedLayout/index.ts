import { createError } from '@fulcro/errors';

import type { Layout } from '@/src/layout';

/**
 * What a type whose values occupy a fixed number of bytes carries at runtime:
 * the layout its type declares, and how one value is read from bytes and
 * written into them.
 *
 * Every numeric type of this package with a fixed layout has these three
 * members, with the meaning `StructType` gives them, so that one of its
 * descriptors goes wherever an element stored as bytes is accepted —
 * `allocate`, `createFixedBufferStorage` and `nativePointerTo` of
 * `@fulcro/memory` take it as they take a struct. It is what to accept when a
 * function stores a numeric type of any width or format:
 *
 * ```ts
 * const zeroed = <T>(type: FixedLayoutType<T>, count: number): DataView => {
 * 	return new DataView(new ArrayBuffer(type.layout.size * count));
 * };
 *
 * zeroed(SignedInteger(32), 8); // 32 bytes
 * ```
 *
 * @template T Type of the values.
 */
export interface FixedLayoutType<T> {
	/**
	 * How much room one value takes and where it may start: the numbers the
	 * type's `'~layout'` declares, and that `sizeOf<T>()` and `alignOf<T>()`
	 * report. Its `encoding` names how the bytes of one value are encoded, so
	 * that `@fulcro/memory` can hold many of them in the typed array of the
	 * same name instead of reading each one through `read`.
	 */
	readonly layout: LayoutOf<T>;

	/**
	 * Reads a value from bytes, little-endian.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts.
	 * @returns The value.
	 * @throws {TypeError} When `view` is not a `DataView`.
	 * @throws {RangeError} When the value does not fit in the view at that
	 * offset.
	 */
	read(view: DataView, offset: number): T;

	/**
	 * Writes a value into bytes, little-endian.
	 *
	 * The value is not checked again, as a struct's are not: it is already of
	 * the type, which `Storage.set` of `@fulcro/memory` confirms before it
	 * writes.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts.
	 * @param value Value to write.
	 * @throws {TypeError} When `view` is not a `DataView`.
	 * @throws {RangeError} When the value does not fit in the view at that
	 * offset; the bytes are then left as they were.
	 */
	write(view: DataView, offset: number, value: T): void;
}

/**
 * The members of {@link FixedLayoutType} as {@link createFixedLayout} makes
 * them: functions that work taken off their object, typed as such.
 *
 * The contract itself declares them as methods, as `NumericType` declares
 * `from` and `is`, because a method's parameter is compared in both
 * directions: declared as a function, `write` would make every descriptor
 * invariant in its type, and `IntegerType<SignedInteger<32>>` would no longer
 * be accepted where a descriptor of any integer type is.
 *
 * @template T Type of the values.
 */
export interface FixedLayoutMembers<T> {
	readonly layout: LayoutOf<T>;
	readonly read: (view: DataView, offset: number) => T;
	readonly write: (view: DataView, offset: number, value: T) => void;
}

/**
 * The layout a type declares, as a value with literal numbers; plain numbers
 * when the type declares none. The encoding is never a literal: the type of a
 * value does not say which one it is stored in.
 *
 * @template T Type of the values.
 */
type LayoutOf<T> = [T] extends [Layout<infer TSize, infer TAlignment>]
	? { readonly size: TSize; readonly alignment: TAlignment; readonly encoding: Encoding }
	: { readonly size: number; readonly alignment: number; readonly encoding: Encoding };

/**
 * How the bytes of one value are encoded, little-endian, named as the language
 * names its typed arrays and `DataView` accessors; the 128-bit formats, which
 * it has none for, are named on the same pattern.
 *
 * Internal, and named nowhere public: the glossary agrees `layout.encoding`
 * and its values, not a type for them.
 */
export type Encoding =
	| 'Int8'
	| 'Uint8'
	| 'Int16'
	| 'Uint16'
	| 'Int32'
	| 'Uint32'
	| 'BigInt64'
	| 'BigUint64'
	| 'Int128'
	| 'Uint128'
	| 'Float16'
	| 'Float32'
	| 'Float64'
	| 'Decimal128';

/**
 * How the values of a type are stored, before anything is checked: what a
 * struct runs for each field, once it has checked the room for all of them.
 *
 * @template T Type of the values.
 */
export interface ByteCodec<T> {
	/** Size, in bytes. */
	readonly size: number;

	/** Alignment, in bytes. */
	readonly alignment: number;

	/**
	 * Reads a value.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts, already checked.
	 * @returns The value.
	 */
	read(view: DataView, offset: number): T;

	/**
	 * Writes a value.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts, already checked.
	 * @param value The value, already of the type.
	 */
	write(view: DataView, offset: number, value: T): void;
}

/**
 * Refuses a view and an offset a value does not fit in, before a byte is
 * touched — so a failed write leaves the view as it was.
 *
 * @param operation Operation being performed, as `Name.read` or `Name.write`.
 * @param size Bytes the value takes.
 * @param view View handed in.
 * @param offset Offset handed in.
 * @throws {TypeError} When `view` is not a `DataView`.
 * @throws {RangeError} When the offset is not an integer from which `size`
 * bytes fit in the view.
 */
export const requireRoom = (
	operation: string,
	size: number,
	view: DataView,
	offset: number,
): void => {
	if (!(view instanceof DataView)) {
		// Spelled out rather than taken from `@/src/element`, which imports
		// `Decimal` — and `Decimal` builds its own layout with this module.
		const received: unknown = view;

		throw createError('FULCRO6017', {
			operation,
			received: received === null ? 'null' : typeof received,
		});
	}

	if (!Number.isInteger(offset) || offset < 0 || offset + size > view.byteLength) {
		throw createError('FULCRO6018', {
			operation,
			size,
			offset,
			available: view.byteLength,
		});
	}
};

/**
 * The members of {@link FixedLayoutType} for a type stored by a codec: its
 * layout, frozen, and a `read` and a `write` that check the room first.
 *
 * @param name Name of the type, as it reads in an error message.
 * @param codec How its values are stored.
 * @param encoding How the codec encodes one value.
 * @returns The members, to be spread into the type's descriptor.
 */
export const createFixedLayout = <T>(
	name: string,
	codec: ByteCodec<T>,
	encoding: Encoding,
): FixedLayoutMembers<T> => {
	const { size, alignment } = codec;

	return {
		layout: Object.freeze({ size, alignment, encoding }) as LayoutOf<T>,

		read: (view, offset): T => {
			requireRoom(`${name}.read`, size, view, offset);

			return codec.read(view, offset);
		},

		write: (view, offset, value): void => {
			requireRoom(`${name}.write`, size, view, offset);
			codec.write(view, offset, value);
		},
	};
};
