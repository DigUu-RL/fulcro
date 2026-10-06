/**
 * One value that can be read and replaced where it is held.
 *
 * The smallest thing that can be handed to code that has to change a value it
 * does not own: a reference to a counter, a setting, one element of a
 * storage.
 *
 * ```ts
 * const increment = (counter: MemoryReference<number>): void => {
 * 	counter.set(counter.get() + 1);
 * };
 *
 * const hits = referenceTo(0);
 *
 * increment(hits);
 * hits.get(); // 1
 * ```
 *
 * A reference has no position and no arithmetic: that is what a
 * {@link Pointer} adds, and every pointer is a reference as well.
 *
 * @template T Type of the value.
 */
export interface MemoryReference<T> {
	/**
	 * Reads the value.
	 *
	 * @returns The value held.
	 */
	get(): T;

	/**
	 * Replaces the value.
	 *
	 * @param value The value to hold.
	 */
	set(value: T): void;
}
