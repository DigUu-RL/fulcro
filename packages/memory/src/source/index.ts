import { createError } from '@fulcro/errors';

import type { MemoryReference } from '@/memoryReference';
import type { Storage } from '@/storage';

/**
 * What a view or a pointer reads and writes through, whatever it was made
 * over: one shape for a storage, an array and a single reference, so the view
 * and the pointer are each written once.
 *
 * Positions are absolute, in the source; the view has already checked them
 * against its own bounds.
 */
export interface Source<T> {
	/**
	 * Tells how many values the source holds now.
	 *
	 * @returns Its length — fixed for a storage, current for an array.
	 */
	readonly length: () => number;

	/**
	 * Reads a value.
	 *
	 * @param operation Operation being performed, for an error message.
	 * @param index Position in the source.
	 * @returns The value.
	 */
	readonly read: (operation: string, index: number) => T;

	/**
	 * Replaces a value.
	 *
	 * @param operation Operation being performed, for an error message.
	 * @param index Position in the source.
	 * @param value The value to hold there.
	 */
	readonly write: (operation: string, index: number, value: T) => void;
}

/**
 * A storage as a source. Its own `get` and `set` still run, so a storage from
 * `allocate` goes on refusing once its memory is released.
 *
 * A read-only view is accepted too, typed as a storage: `write` is never called
 * on a source a read-only view was made over.
 *
 * @param storage The storage.
 * @returns The source.
 */
export const storageSource = <T>(storage: Storage<T>): Source<T> =>
	Object.freeze({
		length: (): number => storage.length,
		read: (_operation: string, index: number): T => storage.get(index),
		write: (_operation: string, index: number, value: T): void => {
			storage.set(index, value);
		},
	});

/**
 * An array as a source, read in place.
 *
 * An array can shrink after it is viewed, which a storage cannot, so every
 * access compares against its length now: past it there is nothing, and an
 * array would answer `undefined` rather than say so.
 *
 * @param array The array.
 * @returns The source.
 */
export const arraySource = <T>(array: readonly T[]): Source<T> => {
	/**
	 * Refuses a position the array no longer reaches.
	 *
	 * @param operation Operation being performed, for the error message.
	 * @param index Position in the array.
	 */
	const requireReached = (operation: string, index: number): void => {
		if (index >= array.length) {
			throw createError('FULCRO7015', {
				operation,
				index,
				length: array.length,
			});
		}
	};

	return Object.freeze({
		length: (): number => array.length,
		read: (operation: string, index: number): T => {
			requireReached(operation, index);

			return array[index] as T;
		},
		write: (operation: string, index: number, value: T): void => {
			requireReached(operation, index);
			(array as T[])[index] = value;
		},
	});
};

/**
 * A single reference as a source of one value, at position `0`. As with a
 * storage, a reference with no `set` is accepted only for reading.
 *
 * @param reference The reference.
 * @returns The source.
 */
export const referenceSource = <T>(reference: MemoryReference<T>): Source<T> =>
	Object.freeze({
		length: (): number => 1,
		read: (): T => reference.get(),
		write: (_operation: string, _index: number, value: T): void => {
			reference.set(value);
		},
	});
