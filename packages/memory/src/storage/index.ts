/**
 * Where a fixed number of values of one type are held, by index.
 *
 * The contract every storage strategy honours, and the only thing a consumer
 * depends on: code written against `Storage<T>` runs unchanged over memory the
 * engine manages and over a buffer of fixed size, and a strategy added later
 * reaches it without that code being touched.
 *
 * ```ts
 * const total = (prices: Storage<number>): number => {
 * 	let sum = 0;
 *
 * 	for (let index = 0; index < prices.length; index++) sum += prices.get(index);
 *
 * 	return sum;
 * };
 * ```
 *
 * The length is fixed when the storage is created. An index is an integer from
 * `0` to `length - 1`; anything else is refused, never read as `undefined` or
 * written past the end.
 *
 * @template T Type of the values held.
 */
export interface Storage<T> {
	/** How many values the storage holds. Never changes. */
	readonly length: number;

	/**
	 * Reads the value at an index.
	 *
	 * @param index Position of the value, from `0` to `length - 1`.
	 * @returns The value.
	 * @throws {RangeError} When the index is not an integer inside the storage.
	 */
	get(index: number): T;

	/**
	 * Replaces the value at an index.
	 *
	 * @param index Position of the value, from `0` to `length - 1`.
	 * @param value The value to hold there.
	 * @throws {RangeError} When the index is not an integer inside the storage.
	 */
	set(index: number, value: T): void;
}
