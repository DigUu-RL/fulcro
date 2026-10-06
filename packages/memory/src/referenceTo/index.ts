import type { MemoryReference } from '@/memoryReference';

/**
 * Makes a reference to a value of its own: one place that can be read and
 * replaced, handed to code that has to change it.
 *
 * ```ts
 * const retries: MemoryReference<number> = referenceTo(0);
 *
 * retries.set(retries.get() + 1);
 * retries.get(); // 1
 * ```
 *
 * The value is held as it is, never copied: `get` returns the very value `set`
 * was given. The reference is the one place the value is kept, so it lives as
 * long as somebody holds the reference.
 *
 * @template T Type of the value, inferred from the one given.
 * @param value The value it starts with.
 * @returns The reference, frozen.
 */
export const referenceTo = <T>(value: T): MemoryReference<T> => {
	let held: T = value;

	return Object.freeze({
		get: (): T => held,
		set: (next: T): void => {
			held = next;
		},
	});
};
