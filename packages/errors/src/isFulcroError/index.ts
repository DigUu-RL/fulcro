import { catalog } from '@/catalog';
import type { ErrorCode } from '@/createError';
import type { FulcroError } from '@/fulcroError';

/**
 * Tells whether a thrown value is an error a `@fulcro` package created, and,
 * given a code, whether it is that one.
 *
 * ```ts
 * try {
 * 	storage.get(12);
 * } catch (error) {
 * 	if (isFulcroError(error, 'FULCRO7002')) {
 * 		error.details.index; // what was asked for
 * 		error.details.length; // what there was
 * 	}
 * }
 * ```
 *
 * Checked against the catalog rather than trusted from the shape: any library
 * can put a `code` on an error, and only a registered one, at the head of its
 * message and with its details beside it, is one of ours. That also holds when
 * two copies of `@fulcro/errors` are installed side by side, where comparing
 * prototypes would answer `false` for an error the other copy created.
 *
 * @template TCode The code asked about, or every code when left out.
 * @param value The thrown value.
 * @param code The one code to accept; any registered code when left out.
 * @returns Whether it is such an error; narrows `details` to its code's fields.
 */
export const isFulcroError = <TCode extends ErrorCode = ErrorCode>(
	value: unknown,
	code?: TCode,
): value is FulcroError<TCode> => {
	if (!(value instanceof Error)) return false;

	const candidate = value as Error & {
		readonly code?: unknown;
		readonly details?: unknown;
	};

	if (typeof candidate.code !== 'string') return false;
	if (code !== undefined && candidate.code !== code) return false;

	return (
		Object.hasOwn(catalog, candidate.code) &&
		value.message.startsWith(`${candidate.code}: `) &&
		typeof candidate.details === 'object' &&
		candidate.details !== null
	);
};
