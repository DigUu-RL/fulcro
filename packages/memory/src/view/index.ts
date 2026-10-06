/**
 * A contiguous region of values observed without owning them, and without
 * being able to change them.
 *
 * What code that only reads should ask for: a function taking a
 * `ReadOnlyView<T>` accepts every `View<T>` as well, and promises its caller
 * that nothing it was handed will be written.
 *
 * ```ts
 * const average = (samples: ReadOnlyView<number>): number => {
 * 	let sum = 0;
 *
 * 	for (let index = 0; index < samples.length; index++) sum += samples.get(index);
 *
 * 	return sum / samples.length;
 * };
 * ```
 *
 * There is no `set` to call, at runtime either: the object a read-only view is
 * has no such property, so a cast does not reopen the region for writing.
 *
 * @template T Type of the values observed.
 */
export interface ReadOnlyView<T> {
	/** How many values the view observes. Never changes. */
	readonly length: number;

	/**
	 * Reads the value at an index of the view.
	 *
	 * @param index Position inside the view, from `0` to `length - 1`.
	 * @returns The value its source holds there.
	 * @throws {RangeError} When the index is not an integer inside the view, or
	 * the array it observes shrank past it.
	 * @throws {Error} When the memory of its source was released.
	 */
	get(index: number): T;

	/**
	 * Observes part of this region, copying nothing.
	 *
	 * @param start Where the part begins, from `0` to `length`.
	 * @param length How many values it observes; the rest of the view when
	 * omitted.
	 * @returns A read-only view over the same source.
	 * @throws {RangeError} When the part does not fit inside this view.
	 */
	subview(start: number, length?: number): ReadOnlyView<T>;
}

/**
 * A contiguous region of values, observed and written without owning them.
 *
 * A view is where and how much: it remembers its source, where in it the
 * region starts and how long the region is, and nothing else. Making one reads
 * no value, and writing through it writes the source — the values are never
 * copied into the view.
 *
 * ```ts
 * const scores = createManagedStorage(100, 0);
 * const firstTen: View<number> = asView(scores, 0, 10);
 *
 * firstTen.set(3, 42);
 * scores.get(3); // 42
 * ```
 *
 * A view owns nothing, so it has nothing to release. It lives no longer than
 * its source's memory either: over a storage from `allocate`, every access
 * checks first that the allocator has not released it.
 *
 * A view has the shape of a {@link Storage}, and is accepted wherever one is.
 *
 * @template T Type of the values observed.
 */
export interface View<T> extends ReadOnlyView<T> {
	/**
	 * Replaces the value at an index of the view, in its source.
	 *
	 * @param index Position inside the view, from `0` to `length - 1`.
	 * @param value The value to hold there.
	 * @throws {RangeError} When the index is not an integer inside the view, or
	 * the array it observes shrank past it.
	 * @throws {Error} When the memory of its source was released.
	 */
	set(index: number, value: T): void;

	/**
	 * Observes part of this region, copying nothing.
	 *
	 * @param start Where the part begins, from `0` to `length`.
	 * @param length How many values it observes; the rest of the view when
	 * omitted.
	 * @returns A view over the same source, starting further into it.
	 * @throws {RangeError} When the part does not fit inside this view.
	 */
	subview(start: number, length?: number): View<T>;

	/**
	 * Observes the same region without the right to write it.
	 *
	 * @returns A read-only view of the same values.
	 */
	readOnly(): ReadOnlyView<T>;
}
