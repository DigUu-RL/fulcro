import type { ReadOnlyView } from '@/view';

/**
 * Marks the type as a shared borrow. Declared, never created: it exists only
 * for the compiler, so any read-only view is not mistaken for a borrow.
 */
declare const borrowed: unique symbol;

/**
 * Values of an owner, lent for reading: a {@link ReadOnlyView} that also
 * knows when the loan is over.
 *
 * ```ts
 * const readings = borrow(owner);
 * const other = borrow(owner); // shared borrows coexist
 *
 * readings.get(0) + other.get(0);
 * ```
 *
 * Any number of shared borrows of one owner can be read at once. One ends
 * when its owner is moved or lent for writing with `borrowMutable`; from then
 * on every read through it throws, and so does every read through a subview
 * or a pointer made from it.
 *
 * @template T Type of the values.
 */
export interface Borrowed<T> extends ReadOnlyView<T> {
	/** Type-only mark, never present at runtime. */
	readonly [borrowed]: T;
}
