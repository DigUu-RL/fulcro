import { createError } from '@fulcro/errors';

import type { Allocation } from '@/src/allocator';
import type { FixedLayoutElement } from '@/src/element';
import type { Storage } from '@/src/storage';
import { requireIndex } from '@/src/storage/requireIndex';

/** How the storage's two operations are named in an error message. */
export interface OperationNames {
	readonly get: string;
	readonly set: string;
}

/**
 * How the values of a storage held as bytes are reached, once every check has
 * passed: what tells one placement of the bytes from another.
 *
 * @template T Type of the values.
 */
export interface ByteAccess<T> {
	/**
	 * Reads the value at an index, already checked.
	 *
	 * @param index Position of the value.
	 * @returns The value.
	 */
	readonly read: (index: number) => T;

	/**
	 * Writes a value at an index, both already checked.
	 *
	 * @param index Position of the value.
	 * @param value Value to write.
	 */
	readonly write: (index: number, value: T) => void;
}

/**
 * Builds the {@link Storage} every placement of bytes shares: the checks an
 * access makes, in the order it makes them, and the errors they throw — so
 * that how the bytes are laid out can never change what a consumer sees but
 * the cost.
 *
 * When the bytes came from an allocator, every access first asks the
 * allocation whether it is still live — one comparison — so a storage whose
 * memory was released refuses instead of reading the values that replaced its
 * own. `set` then refuses a value the element type does not recognise, before
 * a byte is written.
 *
 * @param element Type of the values, already checked.
 * @param length How many values it holds, already checked.
 * @param names How `get` and `set` are named in an error message.
 * @param access How a value is read and written once checked.
 * @param allocation Where the bytes came from, when an allocator lent them.
 * @returns The storage, frozen.
 */
export const createCheckedStorage = <T>(
	element: FixedLayoutElement<T>,
	length: number,
	names: OperationNames,
	access: ByteAccess<T>,
	allocation?: Allocation,
): Storage<T> => {
	const { read, write } = access;

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
