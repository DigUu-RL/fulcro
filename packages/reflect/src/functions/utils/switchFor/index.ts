/**
 * One branch of a {@link switchFor}.
 *
 * @template T Type of the evaluated value.
 * @template R Type produced by the branch.
 */
export interface SwitchCase<T, R> {
	/**
	 * Condition deciding whether this branch handles the value.
	 *
	 * @param value Value being evaluated.
	 * @returns `true` when this branch handles it.
	 */
	readonly when: (value: T) => boolean;

	/**
	 * Produces the result of this branch.
	 *
	 * Only called for the branch that matched, so a branch may do work that
	 * would be wrong or expensive for a value it does not handle.
	 *
	 * @param value Value being evaluated.
	 * @returns The result of the branch.
	 */
	readonly then: (value: T) => R;
}

/**
 * Chooses between branches by condition, as an expression.
 *
 * ```ts
 * const label = switchFor(
 * 	order,
 * 	[
 * 		{ when: (o) => o.total > 1000, then: () => 'large' },
 * 		{ when: (o) => o.items.length === 0, then: () => 'empty' },
 * 	],
 * 	() => 'standard',
 * );
 * ```
 *
 * Where a native `switch` compares one value against constants and runs
 * statements, this takes a predicate per branch and evaluates to a result — so
 * it fits where a statement does not, such as initialising a `const` or filling
 * a property, without the nested ternaries that would otherwise be needed.
 *
 * Branches are tested in order and the first match wins; the rest are never
 * evaluated. `otherwise` is required rather than optional, which is what
 * guarantees a result: an unmatched value returns its fallback instead of
 * `undefined`, and `R` never has to be widened to admit a gap that only shows
 * up at runtime.
 *
 * One limit worth knowing: `when` is a plain predicate, so it decides the
 * branch without narrowing `T` inside `then`. A branch that needs the narrowed
 * type has to assert it itself. Narrowing per branch would require the cases to
 * be inferred as a tuple of individually typed guards, which is a different and
 * considerably heavier API than this one.
 *
 * @template T Type of the evaluated value.
 * @template R Type produced by every branch.
 * @param value Value being evaluated.
 * @param cases Branches, tested in order.
 * @param otherwise Produces the result when no branch matches.
 * @returns The result of the first matching branch, or of `otherwise`.
 */
export const switchFor = <T, R>(
	value: T,
	cases: readonly SwitchCase<T, R>[],
	otherwise: (value: T) => R,
): R => {
	const matched: SwitchCase<T, R> | undefined = cases.find(({ when }) =>
		when(value),
	);

	return matched === undefined ? otherwise(value) : matched.then(value);
};
