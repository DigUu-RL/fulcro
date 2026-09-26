import { catalog } from '@/catalog';
import { CodedError, ErrorCode } from '@/createError';
import { ErrorKind } from '@/definition';

/**
 * Tells whether a thrown value is an error created by `createError`.
 *
 * Checked against the catalog rather than trusted from the shape: any library
 * can put a `code` on an error, and only a registered one has a message this
 * module knows how to take apart.
 *
 * @param error The thrown value.
 * @returns Whether it carries a registered code at the head of its message.
 */
const isCodedError = (error: unknown): error is CodedError => {
	if (!(error instanceof Error)) return false;

	const { code } = error as Error & { readonly code?: unknown };

	return (
		typeof code === 'string' &&
		Object.hasOwn(catalog, code) &&
		error.message.startsWith(`${code}: `)
	);
};

/**
 * Places an error in the context it was raised from, keeping its code and its
 * class.
 *
 * ```ts
 * // what a field's conversion threw
 * // RangeError: FULCRO6031: SignedInteger8.from: 300 is outside -128 to 127.
 * throw prefixError(error, "Vector3.from: field 'x'");
 * // RangeError: FULCRO6031: Vector3.from: field 'x': SignedInteger8.from: 300 is outside -128 to 127.
 * ```
 *
 * The condition is still the one the code names, only found one level further
 * out, so it keeps the code; a new code would tell a consumer matching on the
 * inner one that a different thing went wrong. The original stays reachable as
 * `cause`.
 *
 * A value that is not a coded error is returned as it came: there is no code
 * to keep, and rewording somebody else's error would claim it as ours.
 *
 * @template T The thrown value.
 * @param error What was thrown.
 * @param context Where it was thrown from, as it should read in the message.
 * @returns The error to throw in its place.
 */
export const prefixError = <T>(error: T, context: string): T => {
	if (!isCodedError(error)) return error;

	const code: ErrorCode = error.code;
	const text: string = error.message.slice(code.length + 2);
	const kind = error.constructor as ErrorKind;

	const located: Error = new kind(`${code}: ${context}: ${text}`, {
		cause: error,
	});

	// Hidden for the same reason `createError` hides itself: the frame a reader
	// wants is the one that re-threw.
	Error.captureStackTrace?.(located, prefixError);

	return Object.assign(located, { code }) as T;
};
