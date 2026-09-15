/**
 * One branch of the predicate form of {@link switchFor}.
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
 * A branch for every member of a closed set of values.
 *
 * Written as a mapped type over the union rather than as an index signature,
 * which is what makes the exhaustiveness a compile error: a missing member is a
 * missing required property, and an unknown one has nothing to be assigned to.
 *
 * Each branch receives the single member it handles, not the whole union, so
 * the value arrives already narrowed.
 *
 * @template T Union of the values being matched, typically an enum.
 * @template R Type produced by every branch.
 */
export type ExhaustiveCases<T extends PropertyKey, R> = {
	readonly [K in T]: (value: K) => R;
};

/**
 * Chooses between branches, as an expression.
 *
 * Comes in two forms, and which one to reach for depends on whether the value
 * being matched is drawn from a closed set.
 *
 * **Exhaustive form** — for an enum, or any union of string or number literals.
 * Pass one branch per member and the compiler enforces that every member has
 * one:
 *
 * ```ts
 * enum Status {
 * 	Draft,
 * 	Published,
 * 	Archived,
 * }
 *
 * const label = switchFor(status, {
 * 	[Status.Draft]: () => 'draft',
 * 	[Status.Published]: () => 'published',
 * 	[Status.Archived]: () => 'archived',
 * });
 * ```
 *
 * Leaving a member out does not compile, and neither does adding a branch for
 * something that is not a member. That is the point of this form: when a
 * member is added to the enum later, every `switchFor` over it stops compiling
 * until it is handled — which is exactly the moment to decide what it should
 * do, rather than discovering the gap at runtime. There is deliberately no
 * fallback parameter here, because a fallback is precisely what would absorb
 * the new member in silence and take the guarantee away.
 *
 * **Predicate form** — for anything else, where branches are conditions rather
 * than values:
 *
 * ```ts
 * const size = switchFor(
 * 	order,
 * 	[
 * 		{ when: (o) => o.total > 1000, then: () => 'large' },
 * 		{ when: (o) => o.items.length === 0, then: () => 'empty' },
 * 	],
 * 	() => 'standard',
 * );
 * ```
 *
 * Branches are tested in order and the first match wins; the rest are never
 * evaluated, neither their conditions nor their bodies.
 *
 * `otherwise` is optional, and leaving it out is reflected in the type rather
 * than hidden: the call then evaluates to `R | undefined`, so the compiler
 * makes the caller account for the value that matched nothing. Passing a
 * fallback removes the `undefined`, because nothing can produce it any more.
 *
 * The predicate form cannot be exhaustive. A condition is an arbitrary function
 * and the compiler cannot reason about which values it accepts, which is why
 * only this form has a fallback at all. It also decides a branch without
 * narrowing the value inside `then`, where the exhaustive form hands each
 * branch the single member it handles.
 *
 * **Using it for its effects needs no separate function.** Where the branches
 * return nothing, `R` is inferred as `void` and the call stands on its own as a
 * statement:
 *
 * ```ts
 * switchFor(status, {
 * 	[Status.Draft]: () => saveDraft(),
 * 	[Status.Published]: () => publish(),
 * 	[Status.Archived]: () => archive(),
 * });
 * ```
 *
 * The exhaustiveness check applies there exactly as it does to a call whose
 * result is read.
 *
 * @template T Type of the evaluated value.
 * @template R Type produced by every branch.
 * @param value Value being evaluated.
 * @param cases One branch per member, or branches tested in order.
 * @param otherwise Produces the result when no branch matches. Predicate form
 * only; omitting it admits `undefined` into the result.
 * @returns The result of the branch that handled the value, the result of
 * `otherwise`, or `undefined` when nothing matched and no fallback was given.
 */
// The order of these three is load bearing, and the exhaustive one comes last
// on purpose. When no overload matches, TypeScript reports the failure of the
// last candidate taking that many arguments — so with the exhaustive form
// earlier, forgetting an enum member produced a complaint about `SwitchCase`,
// pointing at the predicate form the caller was not using. Last, it produces
// the one that names the member:
//
//   Property '[Status.Archived]' is missing in type '{ 0: …; 1: … }'
//   but required in type 'ExhaustiveCases<Status, string>'.
//
// The diagnostic is the whole reason this form exists, so it is worth ordering
// for. Which overload a valid call resolves to is unaffected: an array of
// branches and a record of them are not assignable to one another.

/**
 * Chooses between branches by condition, falling back when none matches.
 *
 * @template T Type of the evaluated value.
 * @template R Type produced by every branch.
 * @param value Value being evaluated.
 * @param cases Branches, tested in order; the first match wins.
 * @param otherwise Produces the result when no branch matches.
 * @returns The result of the matching branch, or of `otherwise`.
 */
export function switchFor<T, R>(
	value: T,
	cases: readonly SwitchCase<T, R>[],
	otherwise: (value: T) => R,
): R;

/**
 * Chooses between branches by condition, with nothing to fall back on.
 *
 * @template T Type of the evaluated value.
 * @template R Type produced by every branch.
 * @param value Value being evaluated.
 * @param cases Branches, tested in order; the first match wins.
 * @returns The result of the matching branch, or `undefined` when none matched.
 */
export function switchFor<T, R>(
	value: T,
	cases: readonly SwitchCase<T, R>[],
): R | undefined;

/**
 * Chooses between one branch per member of a closed set, checked exhaustively.
 *
 * Leaving a member out does not compile, and neither does adding a branch for
 * something that is not a member. No fallback is accepted, deliberately: a
 * fallback is what would absorb a newly added member in silence.
 *
 * @template T Union being matched, typically an enum.
 * @template R Type produced by every branch.
 * @param value Value being evaluated.
 * @param cases One branch per member of `T`.
 * @returns The result of the branch handling the value.
 */
export function switchFor<T extends PropertyKey, R>(
	value: T,
	cases: ExhaustiveCases<T, R>,
): R;

export function switchFor<T, R>(
	value: T,
	cases: readonly SwitchCase<T, R>[] | Record<PropertyKey, (value: T) => R>,
	otherwise?: (value: T) => R,
): R | undefined {
	if (!Array.isArray(cases)) {
		return (cases as Record<PropertyKey, (value: T) => R>)[
			value as unknown as PropertyKey
		](value);
	}

	const matched: SwitchCase<T, R> | undefined = (
		cases as readonly SwitchCase<T, R>[]
	).find(({ when }) => when(value));

	if (matched !== undefined) return matched.then(value);

	return otherwise === undefined ? undefined : otherwise(value);
}
