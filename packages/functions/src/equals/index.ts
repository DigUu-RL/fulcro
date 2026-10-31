import { createEquals, type Equals } from '@/src/createEquals';

/**
 * Tells whether two values are equal by their contents.
 *
 * ```ts
 * equals({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] }); // true
 * equals(some(null), none()); // false: same data, different variants
 * ```
 *
 * - A value always equals itself.
 * - Primitives are equal as `Set` finds them: `NaN` equals `NaN`, `0` equals
 *   `-0`, and `1` never equals `1n`.
 * - Objects of different prototypes are never equal.
 * - Plain objects compare their own enumerable keys, in any order; arrays,
 *   their elements, a hole reading as `undefined`; a `Result` or an `Option`,
 *   its variant and its fields; a `Date`, its time; a `Map`, its keys by
 *   identity and its values by contents; a `Set`, its elements by identity;
 *   an `ArrayBuffer`, a `DataView` and a typed array, their contents.
 * - Any other object — an instance of a class, an `Error`, a `Promise` — is
 *   defined by which object it is, and equals only itself.
 * - Two structures that refer to themselves are equal when nothing else in
 *   them differs.
 *
 * The comparison stops at the first difference. Compare a kind of value by a
 * rule of your own — a struct by its descriptor, a class by its key — with a
 * variant made by {@link createEquals}.
 *
 * @template T Type of the values compared.
 * @param left First value.
 * @param right Second value, of the type of the first.
 * @returns `true` when they are equal.
 */
export const equals: Equals = createEquals([]);
