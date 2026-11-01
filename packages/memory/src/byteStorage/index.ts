import { createError } from '@fulcro/errors';

import type { Allocation } from '@/src/allocator';
import { type TypedElements, typedArrayOf } from '@/src/byteStorage/typedArrayOf';
import type { FixedLayoutElement } from '@/src/element';
import type { Storage } from '@/src/storage';
import { requireIndex } from '@/src/storage/requireIndex';

/** How the storage's two operations are named in an error message. */
interface OperationNames {
	readonly get: string;
	readonly set: string;
}

/**
 * Builds a storage that holds its values as bytes, end to end, over bytes it
 * was handed: the one implementation behind `createFixedBufferStorage` and
 * `allocate`, which differ only in where the bytes come from.
 *
 * When the bytes came from an allocator, every access first asks the
 * allocation whether it is still live — one comparison — so a storage whose
 * memory was released refuses instead of reading the values that replaced its
 * own.
 *
 * When the element's encoding has a typed array, the values are read and
 * written through one over the same bytes, and neither `element.read` nor
 * `element.write` nor a `DataView` accessor is called. Everything else an
 * access does — the checks, the errors, the bytes it leaves — is the same, so
 * which way a storage went is not observable but in what it costs.
 *
 * @param element Type of the values, already checked.
 * @param length How many values it holds, already checked.
 * @param view Bytes to hold them in, at least `length × element.layout.size`.
 * @param names How `get` and `set` are named in an error message.
 * @param allocation Where the bytes came from, when an allocator lent them.
 * @returns The storage, frozen.
 */
export const createByteStorage = <T>(
	element: FixedLayoutElement<T>,
	length: number,
	view: DataView,
	names: OperationNames,
	allocation?: Allocation,
): Storage<T> => {
	const { size } = element.layout;
	const elements: TypedElements | undefined = typedArrayOf(element.layout, length, view);

	// A typed array over a buffer that shrank or was detached reaches no
	// element and reads `undefined` where a `DataView` throws, so once it
	// reaches fewer than `length` the access goes through the element, and
	// throws exactly what it would have thrown without the typed array.

	/**
	 * Reads the value at an index, already checked.
	 *
	 * @param index Position of the value.
	 * @returns The value.
	 */
	const read = (index: number): T => {
		if (elements?.length === length) return elements[index] as T;

		return element.read(view, index * size);
	};

	/**
	 * Writes a value at an index, both already checked.
	 *
	 * @param index Position of the value.
	 * @param value Value to write.
	 */
	const write = (index: number, value: T): void => {
		if (elements?.length === length) {
			elements[index] = value;

			return;
		}

		element.write(view, index * size, value);
	};

	/**
	 * Refuses an access once the allocation's memory was released.
	 *
	 * @param operation Operation being performed, for the error message.
	 */
	const requireLive = (operation: string): void => {
		if (allocation !== undefined && !allocation.isLive()) {
			throw createError('FULCRO7009', { operation });
		}
	};

	return Object.freeze({
		length,

		get: (index: number): T => {
			requireLive(names.get);
			requireIndex(names.get, index, length);

			return read(index);
		},

		set: (index: number, value: T): void => {
			requireLive(names.set);
			requireIndex(names.set, index, length);

			if (!element.is(value)) {
				throw createError('FULCRO7004', {
					operation: names.set,
					element: element.name,
				});
			}

			write(index, value);
		},
	});
};
