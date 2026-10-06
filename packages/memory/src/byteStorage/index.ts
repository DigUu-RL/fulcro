import { createError } from '@fulcro/errors';

import type { Allocation } from '@/allocator';
import type { FixedLayoutElement } from '@/element';
import type { Storage } from '@/storage';
import { requireIndex } from '@/storage/requireIndex';

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

			return element.read(view, index * size);
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

			element.write(view, index * size, value);
		},
	});
};
