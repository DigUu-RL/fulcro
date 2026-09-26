import { createError } from '@fulcro/errors';

/** One reachable leaf of a type, and what is at the end of it. */
export interface TypePath {
	/**
	 * The path, in the notation a person writes.
	 *
	 * Nested properties are dotted and arrays carry `[]`, so
	 * `items[].sku` reads as "the `sku` of each item".
	 */
	readonly path: string;

	/** The type at the end of the path, as the compiler renders it. */
	readonly type: string;

	/** Whether every step along the path is present. */
	readonly optional: boolean;
}

/**
 * Lists every leaf a type can be walked to.
 *
 * ```ts
 * pathsOf<Order>();
 * // [
 * //   { path: 'id',                    type: 'number',   optional: false },
 * //   { path: 'customer.email',        type: 'string',   optional: false },
 * //   { path: 'customer.address.city', type: 'string',   optional: false },
 * //   { path: 'items[].sku',           type: 'string',   optional: false },
 * //   { path: 'status',    type: '"pending" | "paid"',   optional: false },
 * //   { path: 'placedAt',              type: 'Date',     optional: false },
 * // ]
 * ```
 *
 * For anything that has to enumerate a shape rather than read one value: the
 * columns a report can sort by, the fields a form renders, the keys a
 * translation file needs, the paths an audit log records.
 *
 * **Three rules keep the answer useful**, and each exists because the obvious
 * version without it produces nonsense.
 *
 * A **primitive is a leaf**. Descending into one yields the whole of
 * `String.prototype` — `customer.email.trimLeft` is a real property path and
 * useless as a data path.
 *
 * A **known class is a leaf**. `placedAt` reports `Date`, not the fifty methods
 * a `Date` carries.
 *
 * **Recursion stops** at the repeat, reporting the path with the type at the
 * end of it. A type containing itself has infinitely many paths, and the honest
 * answer is where the repeat begins rather than an arbitrary depth of it.
 *
 * A union of primitives is a leaf and reports the union. A union with an object
 * in it is reported without being descended: there is no single path to promise
 * when the shape depends on which branch a value took.
 *
 * Needs the transformer. Without it the call refuses rather than guessing.
 *
 * @template T Type to walk.
 * @param paths Filled in by the transformer.
 * @returns Every leaf, in the order the properties were declared.
 * @throws {Error} When the call was not resolved at compile time.
 */
export const pathsOf = <T>(
	paths?: readonly TypePath[],
): readonly TypePath[] => {
	if (paths === undefined) {
		throw createError('FULCRO4005');
	}

	return paths;
};
