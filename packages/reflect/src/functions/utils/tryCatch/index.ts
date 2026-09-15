/** Outcome of an operation that produced a value. */
export interface Success<T> {
	/** Value the operation produced. */
	readonly data: T;

	/** Always `null`, which is what tells a success from a failure. */
	readonly error: null;
}

/**
 * Outcome of an operation that threw.
 *
 * The error is non nullable by construction, so that `error === null` is enough
 * to tell the two cases apart. {@link tryCatch} upholds that at runtime: a
 * thrown `null` or `undefined` — legal in JavaScript, however pathological — is
 * wrapped in an `Error` rather than stored as is, because storing it would make
 * a failure indistinguishable from a success.
 *
 * @template E Type of the captured error.
 */
export interface Failure<E> {
	/** Always `null`, since the operation produced no value. */
	readonly data: null;

	/** The captured error. */
	readonly error: NonNullable<E>;
}

/**
 * The outcome of an operation, as a value rather than as control flow.
 *
 * Discriminate on `error`, never on `data`:
 *
 * ```ts
 * if (result.error === null) use(result.data);
 * ```
 *
 * `data` is a valid discriminant only while the success type excludes every
 * falsy value, which is a property of `T` and not of this type — `0`, `''` and
 * `null` are all perfectly good results, and `if (result.data)` reports each of
 * them as a failure.
 *
 * @template T Type produced on success.
 * @template E Type of the error captured on failure.
 */
export type Result<T, E = unknown> = Success<T> | Failure<E>;

/**
 * Something a thrown value can be stored as without defeating the discriminant.
 *
 * @param error Value that was thrown.
 * @returns The value itself, or an `Error` standing in for a nullish throw.
 */
const asStorableError = (error: unknown): NonNullable<unknown> => {
	if (error !== null && error !== undefined) return error;

	return new Error(`Operation rejected with ${String(error)}`, {
		cause: error,
	});
};

/**
 * Runs an operation and returns its outcome instead of throwing.
 *
 * ```ts
 * const result = await tryCatch(() => fetch(url));
 *
 * if (result.error !== null) return fallback;
 *
 * use(result.data);
 * ```
 *
 * **Prefer the callback form.** Passing a promise that already exists cannot
 * catch anything the expression throws on its way to producing it: in
 * `tryCatch(risky())`, `risky` runs first, and a synchronous throw inside it
 * escapes before this function is ever called. The callback form moves that
 * call inside the `try`, which is the only way to cover both the synchronous
 * and the asynchronous failure of the same operation. The promise form is kept
 * because it reads better when the promise is already in hand.
 *
 * `E` defaults to `unknown` rather than to `Error`, deliberately. JavaScript
 * lets any value be thrown, and typing the error as an `Error` without checking
 * would be a claim this function cannot keep — `result.error.message` would
 * then read `undefined` whenever something threw a string. Narrow it at the use
 * site, or pass the type explicitly when you own every throw site.
 *
 * Always returns a promise, including for an operation that is entirely
 * synchronous.
 *
 * @template T Type produced by the operation.
 * @template E Type of the error captured on failure.
 * @param operation Callback performing the operation, or a promise already
 * running it.
 * @returns The outcome of the operation.
 */
export const tryCatch = async <T, E = unknown>(
	operation: Promise<T> | (() => T | PromiseLike<T>),
): Promise<Result<Awaited<T>, E>> => {
	try {
		const data: Awaited<T> = await (typeof operation === 'function'
			? operation()
			: operation);

		return { data, error: null };
	} catch (error) {
		return { data: null, error: asStorableError(error) as NonNullable<E> };
	}
};
