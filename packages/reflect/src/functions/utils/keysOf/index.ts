/**
 * Reads the keys a type declares.
 *
 * ```ts
 * interface Order {
 * 	id: number;
 * 	customer: Customer;
 * 	total: number;
 * }
 *
 * keysOf<Order>(); // ['id', 'customer', 'total']
 * ```
 *
 * For the lists a program keeps writing out by hand and forgetting to update:
 * the columns of a table, the fields of a form, the properties to copy, the
 * headers of a CSV. Add a property to `Order` and every one of those follows.
 *
 * **This is deliberately not `Object.keys`.** The keys of a *value* and the keys
 * of a *type* are different questions with different answers: structural typing
 * lets an object carry more than its type declares, which is exactly why
 * `Object.keys` returns `string[]` rather than `(keyof T)[]`. Typing that cast
 * as the narrower thing would be a lie of the same family as the language's own
 * `as`. This one is honest because it never looks at a value — it reports what
 * the type says, resolved while the compiler still knows.
 *
 * Symbol-keyed members are left out: they have no string name to report.
 *
 * Needs the transformer. Without it the call refuses rather than guessing,
 * since a type has no runtime existence for a plain function to inspect.
 *
 * @template T Type whose keys are wanted.
 * @param keys Filled in by the transformer.
 * @returns The declared keys, in the order they were written.
 * @throws {Error} When the call was not resolved at compile time.
 */
export const keysOf = <T>(
	keys?: readonly (string & keyof T)[],
): readonly (string & keyof T)[] => {
	if (keys === undefined) {
		throw new Error(
			'keysOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no keys to read — a primitive, a union, or an unresolved generic.',
		);
	}

	return keys;
};
