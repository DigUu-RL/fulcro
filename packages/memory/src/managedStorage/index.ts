import type { Storage } from '@/storage';
import { requireIndex } from '@/storage/requireIndex';
import { requireLength } from '@/storage/requireLength';

/**
 * Creates a storage held in memory the JavaScript engine manages: an ordinary
 * array, behind the {@link Storage} contract.
 *
 * ```ts
 * const scores: Storage<number> = createManagedStorage(3, 0);
 *
 * scores.set(1, 42);
 * scores.get(1); // 42
 * ```
 *
 * Any value can be held, of any type, and is held as it is: `get` returns the
 * very value `set` was given, not a copy. That is what sets it apart from a
 * storage of bytes, which can only hold a type with a fixed layout and makes a
 * new value on every read.
 *
 * @param length How many values it holds, fixed from now on.
 * @param initial Value every position holds until it is set.
 * @returns The storage, frozen.
 * @throws {RangeError} When the length is not a non-negative safe integer.
 */
export const createManagedStorage = <T>(
	length: number,
	initial: T,
): Storage<T> => {
	requireLength('createManagedStorage', length);

	const values: T[] = new Array<T>(length).fill(initial);

	return Object.freeze({
		length,

		get: (index: number): T => {
			requireIndex('ManagedStorage.get', index, length);

			return values[index] as T;
		},

		set: (index: number, value: T): void => {
			requireIndex('ManagedStorage.set', index, length);

			values[index] = value;
		},
	});
};
