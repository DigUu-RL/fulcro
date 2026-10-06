import { createError } from '@fulcro/errors';

import { failure, type Result, success } from '@/result';

/**
 * Something a thrown value can be stored as without defeating the discriminant.
 *
 * A failure's error is non nullable by construction, so that `error === null`
 * is enough to tell a failure from a success. A thrown `null` or `undefined` —
 * legal in JavaScript, however pathological — is therefore wrapped in an
 * `Error` rather than stored as is.
 *
 * @param error Value that was thrown.
 * @returns The value itself, or an `Error` standing in for a nullish throw.
 */
const asStorableError = (error: unknown): NonNullable<unknown> => {
	if (error !== null && error !== undefined) return error;

	return createError('FULCRO2001', { operation: 'tryCatch', thrown: error });
};

/**
 * Runs an operation and returns its outcome instead of throwing.
 *
 * ```ts
 * const result = await tryCatch(() => fetch(url));
 *
 * if (result.isFailure()) return fallback;
 *
 * use(result.value);
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
		const value: Awaited<T> = await (typeof operation === 'function'
			? operation()
			: operation);

		return success(value);
	} catch (error) {
		return failure(asStorableError(error) as NonNullable<E>);
	}
};
