import type { Allocation } from '@/src/allocator';
import { createCheckedStorage, type OperationNames } from '@/src/byteStorage/checkedStorage';
import { type TypedElements, typedArrayOf } from '@/src/byteStorage/typedArrayOf';
import type { FixedLayoutElement } from '@/src/element';
import type { Storage } from '@/src/storage';

/**
 * Where in the bytes the values sit: the byte the first one starts at, and how
 * many bytes there are from the start of one to the start of the next.
 *
 * End to end is `{ start: 0, stride: element.layout.size }`. One field of a
 * struct held among the others is `{ start: offset, stride: struct size }`;
 * one field held in a column of its own is `{ start: column, stride: field
 * size }`.
 */
export interface BytePlacement {
	readonly start: number;
	readonly stride: number;
}

/**
 * Builds a storage that holds each value as its bytes, at a fixed stride, over
 * bytes it was handed: the one implementation behind `createFixedBufferStorage`
 * and `allocate` in an array of structures, and behind a view of one field,
 * which differ only in where the bytes come from and where in them each value
 * sits.
 *
 * When the values sit end to end and the element's encoding has a typed
 * array, they are read and written through one over the same bytes, and
 * neither `element.read` nor `element.write` nor a `DataView` accessor is
 * called. Everything else an access does — the checks, the errors, the bytes
 * it leaves — is `createCheckedStorage`'s, so which way a storage went is not
 * observable but in what it costs.
 *
 * @param element Type of the values, already checked.
 * @param length How many values it holds, already checked.
 * @param view Bytes to hold them in, reaching every value the placement puts.
 * @param names How `get` and `set` are named in an error message.
 * @param allocation Where the bytes came from, when an allocator lent them.
 * @param placement Where each value sits; end to end from the first byte when
 * omitted.
 * @returns The storage, frozen.
 */
export const createByteStorage = <T>(
	element: FixedLayoutElement<T>,
	length: number,
	view: DataView,
	names: OperationNames,
	allocation?: Allocation,
	placement: BytePlacement = { start: 0, stride: element.layout.size },
): Storage<T> => {
	const { start, stride } = placement;

	// A typed array indexes values end to end, so one with a gap between them —
	// a field read among the others — goes through the element instead.
	const elements: TypedElements | undefined =
		stride === element.layout.size ? typedArrayOf(element.layout, length, view, start) : undefined;

	// A typed array over a buffer that shrank or was detached reaches no
	// element and reads `undefined` where a `DataView` throws, so once it
	// reaches fewer than `length` the access goes through the element, and
	// throws exactly what it would have thrown without the typed array.
	return createCheckedStorage(
		element,
		length,
		names,
		{
			read: (index: number): T => {
				if (elements?.length === length) return elements[index] as T;

				return element.read(view, start + index * stride);
			},

			write: (index: number, value: T): void => {
				if (elements?.length === length) {
					elements[index] = value;

					return;
				}

				element.write(view, start + index * stride, value);
			},
		},
		allocation,
	);
};
