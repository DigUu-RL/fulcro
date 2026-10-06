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
 * @template T Type of the values owned.
 */
export interface Owned<T> {
	/**
	 * How many values the owned storage holds.
	 *
	 * @throws {Error} When the owner was moved.
	 */
	readonly length: number;

	/** Type-only mark, never present at runtime. */
	readonly [owner]: T;
}
