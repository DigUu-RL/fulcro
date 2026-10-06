import type { DetailsOf, ErrorCode } from '@/createError';
import { isFulcroError } from '@/isFulcroError';

/**
 * An error thrown by a `@fulcro` package: its code, and the details its
 * message was built from.
 *
 * Still an instance of the built-in class it is registered with —
 * `RangeError`, `TypeError` — so a consumer's `instanceof` checks keep
 * matching; that class is not part of this type, and `instanceof RangeError`
 * narrows to it on its own.
 *
 * Without a code, the type is the union of every code's error, so comparing
 * `code` narrows `details` too:
 *
 * ```ts
 * if (error instanceof FulcroError && error.code === 'FULCRO7002') {
 * 	error.details.length; // number
 * }
 * ```
 *
 * @template TCode The code, or every code when left out.
 */
export type FulcroError<TCode extends ErrorCode = ErrorCode> =
	TCode extends ErrorCode
		? Error & {
				readonly code: TCode;
				readonly details: DetailsOf<TCode>;
			}
		: never;

/**
 * Recognises, with `instanceof`, any error a `@fulcro` package created.
 *
 * ```ts
 * error instanceof FulcroError; // true for every registered code
 * error instanceof RangeError; // still true where the code is a RangeError
 * ```
 *
 * Not a class: an error keeps the built-in class its code is registered with,
 * and cannot also extend this one. `instanceof` asks the value instead, and
 * the answer is {@link isFulcroError}'s — the catalog, not a prototype, so it
 * holds across two installed copies of the package. Use `isFulcroError` with a
 * code to narrow `details` to that code's fields.
 */
export const FulcroError: {
	readonly [Symbol.hasInstance]: (value: unknown) => value is FulcroError;
} = Object.freeze({
	[Symbol.hasInstance]: (value: unknown): value is FulcroError =>
		isFulcroError(value),
});
