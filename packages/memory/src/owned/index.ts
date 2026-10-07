/**
 * Marks the type as an owner. Declared, never created: it exists only for the
 * compiler, so a plain object with a `length` is not mistaken for one.
 */
declare const owner: unique symbol;

/**
 * The one handle that owns a storage: the only thing its values can be
 * borrowed from, and the thing that moves when ownership changes hands.
 *
 * ```ts
 * const scores: Owned<number> = own(() => createManagedStorage(100, 0));
 *
 * borrowMutable(scores).set(3, 42);
 * borrow(scores).get(3); // 42
 * ```
 *
 * An owner exposes no values of its own. Reading goes through
 * {@link Borrowed}, writing through {@link MutableBorrow}, and that is what
 * lets every access be checked against the borrows still allowed.
 *
 * Once it is handed to `move`, this handle is spent: anything asked of it
 * throws, and the owner `move` returned takes its place.
 *
 * Declared with `using`, the ownership ends with the scope:
 *
 * ```ts
 * {
 * 	using scores = own(() => createManagedStorage(100, 0));
 * 	const view = borrowMutable(scores);
 * 	// …
 * } // every borrow of scores ends here, however the block is left
 * ```
 *
 * @template T Type of the values owned.
 */
export interface Owned<T> extends Disposable {
	/**
	 * How many values the owned storage holds.
	 *
	 * @throws {Error} When the owner was moved or disposed.
	 */
	readonly length: number;

	/**
	 * Ends the ownership: every borrow taken from it ends, and the owner
	 * refuses everything asked of it from then on. Called by `using` when the
	 * scope ends.
	 *
	 * The memory itself stays where it is — it belongs to the allocator, and
	 * goes back when the allocator releases it, as a frame left or an arena
	 * reset does. An owner already moved from has nothing to end, and disposing
	 * it, or disposing twice, does nothing.
	 */
	[Symbol.dispose](): void;

	/** Type-only mark, never present at runtime. */
	readonly [owner]: T;
}
