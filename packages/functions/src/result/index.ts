import { createVariant, variantPrototype } from '@/variant';

/**
 * One branch per variant of a {@link Result}, as {@link ResultMethods.handle}
 * takes them.
 *
 * Both are required, which is what makes the handling exhaustive: leaving one
 * out is a missing property, and naming a third is an excess one.
 *
 * @template T Type produced on success.
 * @template E Type of the error on failure.
 * @template R Type produced by both branches.
 */
export interface ResultCases<T, E, R> {
	/**
	 * Handles a success.
	 *
	 * @param value Value the operation produced.
	 * @returns The result of the branch.
	 */
	readonly success: (value: T) => R;

	/**
	 * Handles a failure.
	 *
	 * @param error The error the operation failed with.
	 * @returns The result of the branch.
	 */
	readonly failure: (error: NonNullable<E>) => R;
}

/**
 * The methods both variants of a {@link Result} carry.
 *
 * Declared once with the full `T` and `E` rather than per variant, because a
 * method called on a union is callable only when every member declares it with
 * the same signature — which is also why each variant carries both type
 * parameters.
 *
 * @template T Type produced on success.
 * @template E Type of the error on failure.
 */
export interface ResultMethods<T, E> {
	/**
	 * Tells whether this is a success, narrowing it when it is.
	 *
	 * @returns `true` for a success.
	 */
	isSuccess(): this is Success<T, E>;

	/**
	 * Tells whether this is a failure, narrowing it when it is.
	 *
	 * @returns `true` for a failure.
	 */
	isFailure(): this is Failure<T, E>;

	/**
	 * Handles both variants, as an expression.
	 *
	 * ```ts
	 * const message = result.handle({
	 * 	success: (user) => `Hello, ${user.name}`,
	 * 	failure: (error) => `Could not load: ${String(error)}`,
	 * });
	 * ```
	 *
	 * Only the branch for this variant runs.
	 *
	 * @template R Type produced by both branches.
	 * @param cases One branch per variant; leaving one out does not compile.
	 * @returns The result of the branch that ran.
	 */
	handle<R>(cases: ResultCases<T, E, R>): R;
}

/**
 * Outcome of an operation that produced a value.
 *
 * @template T Type of the value produced.
 * @template E Type of the error the operation could have failed with.
 */
export interface Success<T, E = never> extends ResultMethods<T, E> {
	/** Value the operation produced. */
	readonly value: T;

	/** Always `null`, which is what tells a success from a failure. */
	readonly error: null;
}

/**
 * Outcome of an operation that failed.
 *
 * The error is non nullable by construction, so that `error === null` is enough
 * to tell the two variants apart.
 *
 * @template T Type of the value the operation would have produced.
 * @template E Type of the error.
 */
export interface Failure<T = never, E = unknown> extends ResultMethods<T, E> {
	/** Always `null`, since the operation produced no value. */
	readonly value: null;

	/** The error the operation failed with. */
	readonly error: NonNullable<E>;
}

/**
 * The outcome of an operation, as a value rather than as control flow.
 *
 * Handle both variants at once with `handle`, which does not compile until
 * both are covered:
 *
 * ```ts
 * const label = result.handle({
 * 	success: (value) => `got ${value}`,
 * 	failure: (error) => `failed: ${String(error)}`,
 * });
 * ```
 *
 * or narrow first, with `isSuccess()` or `isFailure()`:
 *
 * ```ts
 * if (result.isSuccess()) use(result.value);
 * ```
 *
 * `error === null` narrows too, and is the check to use on a result that has
 * been through `structuredClone` or JSON — a copy keeps the data of the value
 * but not the methods it inherits. Never discriminate on `value`: `0`, `''` and
 * `null` are perfectly good values, and `if (result.value)` reports every one
 * of them as a failure.
 *
 * @template T Type produced on success.
 * @template E Type of the error on failure.
 */
export type Result<T, E = unknown> = Success<T, E> | Failure<T, E>;

/** Methods every success inherits. */
const SUCCESS = variantPrototype({
	isSuccess: (): boolean => true,
	isFailure: (): boolean => false,

	// Method syntax rather than an arrow: the branch needs the value the
	// method was called on, and only `this` has it.
	handle<R>(
		this: Success<unknown, unknown>,
		cases: ResultCases<unknown, unknown, R>,
	): R {
		return cases.success(this.value);
	},
});

/** Methods every failure inherits. */
const FAILURE = variantPrototype({
	isSuccess: (): boolean => false,
	isFailure: (): boolean => true,

	handle<R>(
		this: Failure<unknown, unknown>,
		cases: ResultCases<unknown, unknown, R>,
	): R {
		return cases.failure(this.error);
	},
});

/**
 * Creates a success.
 *
 * ```ts
 * const parsed: Result<number, string> = success(42);
 * ```
 *
 * @template T Type of the value.
 * @param value Value the operation produced.
 * @returns A frozen success carrying it.
 */
export const success = <T>(value: T): Success<T> =>
	createVariant(SUCCESS, { value, error: null });

/**
 * Creates a failure.
 *
 * ```ts
 * const parsed: Result<number, string> = failure('not a number');
 * ```
 *
 * @template E Type of the error.
 * @param error The error; never `null` or `undefined`, which would make the
 * failure read as a success.
 * @returns A frozen failure carrying it.
 */
export const failure = <E>(error: NonNullable<E>): Failure<never, E> =>
	createVariant(FAILURE, { value: null, error });
