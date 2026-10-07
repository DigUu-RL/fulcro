import type { View } from '@/view';

/**
 * Marks the type as an exclusive borrow. Declared, never created: it exists
 * only for the compiler, so any view is not mistaken for a borrow.
 */
declare const mutableBorrow: unique symbol;

/**
 * Values of an owner, lent for writing: a {@link View} that is the only
 * access to them while it lasts.
 *
 * ```ts
 * const scores = borrowMutable(owner);
 *
 * scores.set(0, 10);
 * scores.get(0); // 10
 * ```
 *
 * Exclusive: it ends as soon as its owner is moved or lent again, for reading
 * or for writing, and from then on every access through it — or through a
 * subview, a read-only view or a pointer made from it — throws.
 *
 * @template T Type of the values.
 */
export interface MutableBorrow<T> extends View<T> {
	/** Type-only mark, never present at runtime. */
	readonly [mutableBorrow]: T;
}
