import { createVariant, variantPrototype } from '@/variant';

/**
 * One branch per variant of an {@link Option}, as {@link OptionMethods.handle}
 * takes them.
 *
 * Both are required, which is what makes the handling exhaustive: leaving one
 * out is a missing property, and naming a third is an excess one.
 *
 * @template T Type of the value when present.
 * @template R Type produced by both branches.
 */
export interface OptionCases<T, R> {
	/**
	 * Handles a present value.
	 *
	 * @param value The value.
	 * @returns The result of the branch.
	 */
	readonly some: (value: T) => R;

	/**
	 * Handles an absent value.
	 *
	 * @returns The result of the branch.
	 */
	readonly none: () => R;
}

/**
 * The methods both variants of an {@link Option} carry.
 *
 * Declared once with the full `T` rather than per variant, because a method
 * called on a union is callable only when every member declares it with the
 * same signature — which is also why `None` carries a `T` it never holds.
 *
 * @template T Type of the value when present.
 */
export interface OptionMethods<T> {
	/**
	 * Tells whether a value is present, narrowing this when it is.
	 *
	 * @returns `true` for `Some`.
	 */
	isSome(): this is Some<T>;

	/**
	 * Tells whether the value is absent, narrowing this when it is.
	 *
	 * @returns `true` for `None`.
	 */
	isNone(): this is None<T>;

	/**
	 * Handles both variants, as an expression.
	 *
	 * ```ts
	 * const greeting = user.handle({
	 * 	some: (found) => `Hello, ${found.name}`,
	 * 	none: () => 'Hello, stranger',
	 * });
	 * ```
	 *
	 * Only the branch for this variant runs.
	 *
	 * @template R Type produced by both branches.
	 * @param cases One branch per variant; leaving one out does not compile.
	 * @returns The result of the branch that ran.
	 */
	handle<R>(cases: OptionCases<T, R>): R;
}

/**
 * A value that is present.
 *
 * @template T Type of the value.
 */
export interface Some<T> extends OptionMethods<T> {
	/** The value. */
	readonly value: T;
}

/**
 * A value that is absent.
 *
 * @template T Type the value would have had.
 */
export interface None<T = never> extends OptionMethods<T> {
	/** Always `null`, since there is no value. */
	readonly value: null;
}

/**
 * A value that may be absent, as a value of its own rather than as `null`.
 *
 * Handle both variants at once with `handle`, which does not compile until
 * both are covered:
 *
 * ```ts
 * const name = optionOf(user).handle({
 * 	some: (found) => found.name,
 * 	none: () => 'anonymous',
 * });
 * ```
 *
 * or narrow first, with `isSome()` or `isNone()`:
 *
 * ```ts
 * if (option.isSome()) use(option.value);
 * ```
 *
 * Discriminate with the methods, never on `value`: `some(null)` is a present
 * value that happens to be `null`, and only the variant tells it from `none()`.
 *
 * @template T Type of the value when present.
 */
export type Option<T> = Some<T> | None<T>;

/** Methods every present value inherits. */
const SOME = variantPrototype({
	isSome: (): boolean => true,
	isNone: (): boolean => false,

	// Method syntax rather than an arrow: the branch needs the value the
	// method was called on, and only `this` has it.
	handle<R>(this: Some<unknown>, cases: OptionCases<unknown, R>): R {
		return cases.some(this.value);
	},
});

/** Methods every absent value inherits. */
const NONE = variantPrototype({
	isSome: (): boolean => false,
	isNone: (): boolean => true,
	handle: <R>(cases: OptionCases<unknown, R>): R => cases.none(),
});

/**
 * The one absent value. There is nothing in it to tell two apart, so every
 * `none()` and every nullish `optionOf` returns this same object.
 */
const ABSENT: None = createVariant(NONE, { value: null });

/**
 * Creates a present value.
 *
 * ```ts
 * const port: Option<number> = some(8080);
 * ```
 *
 * The value is kept as it is, `null` and `undefined` included — use
 * {@link optionOf} to have those read as absent.
 *
 * @template T Type of the value.
 * @param value The value.
 * @returns A frozen `Some` carrying it.
 */
export const some = <T>(value: T): Some<T> => createVariant(SOME, { value });

/**
 * Returns the absent value.
 *
 * ```ts
 * const port: Option<number> = none();
 * ```
 *
 * Always the same frozen object, so calling it allocates nothing.
 *
 * @template T Type the value would have had, usually inferred from where the
 * result goes.
 * @returns The absent value.
 */
export const none = <T = never>(): None<T> => ABSENT as None<T>;

/**
 * Turns a nullable value into an option: `null` and `undefined` are absent,
 * anything else is present.
 *
 * ```ts
 * const user: Option<User> = optionOf(users.get(id));
 * ```
 *
 * Only nullish values are absent. `0`, `''` and `false` are present, since
 * each is a value somebody meant.
 *
 * @template T Type of the value.
 * @param value The value, or `null` or `undefined`.
 * @returns `none()` for a nullish value, a `Some` carrying it otherwise.
 */
export const optionOf = <T>(value: T): Option<NonNullable<T>> =>
	value === null || value === undefined ? none() : some(value);
