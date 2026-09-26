import { Catalog, catalog } from '@/catalog';
import { ErrorDefinition } from '@/definition';

/**
 * Every code a `@fulcro` package can throw, `FULCRO` followed by four digits.
 *
 * The leading digit names the package: 1 collections, 2 functions, 3 parallel,
 * 4 reflect, 5 transform-core, 6 types. A code is never reused, even after the
 * error it named is gone, so matching on one stays safe across versions.
 */
export type ErrorCode = keyof Catalog;

/**
 * An error thrown by a `@fulcro` package.
 *
 * Still an instance of the class it always was — `RangeError`, `TypeError` —
 * with the code added beside the message, so recovering from one never means
 * parsing a string.
 *
 * @template TError The class the error is an instance of.
 */
export type CodedError<TError extends Error = Error> = TError & {
	readonly code: ErrorCode;
};

/** What the template of a code takes. */
type ArgumentsOf<TCode extends ErrorCode> = Parameters<
	Catalog[TCode]['message']
>;

/** The class the error of a code is created as. */
type KindOf<TCode extends ErrorCode> = InstanceType<Catalog[TCode]['kind']>;

/**
 * Creates the error a code names, ready to be thrown.
 *
 * ```ts
 * throw createError('FULCRO6021', 'Vector3.from', 'x');
 * // TypeError: FULCRO6021: Vector3.from: missing field 'x'.
 * ```
 *
 * The message starts with the code, and the code is also on the error as
 * `code`: the message is for whoever reads the log, the property for the code
 * that catches it.
 *
 * @template TCode The code being thrown.
 * @param code A registered code; an unregistered one does not compile.
 * @param values What the code's message is built from, as its template
 * declares them.
 * @returns The error, of the class the code is registered with.
 */
export const createError = <TCode extends ErrorCode>(
	code: TCode,
	...values: ArgumentsOf<TCode>
): CodedError<KindOf<TCode>> => {
	const definition: ErrorDefinition = catalog[code];

	// The catalog's templates are typed one by one, and `values` was checked
	// against the right one at the call site; here they only need to meet.
	const text: string = (
		definition.message as (...parameters: unknown[]) => string
	)(...values);

	const error: Error = new definition.kind(
		`${code}: ${text}`,
		definition.cause === undefined
			? undefined
			: {
					cause: (definition.cause as (...parameters: unknown[]) => unknown)(
						...values,
					),
				},
	);

	// Without this the first frame of every stack would be this function, and
	// the line a reader wants — where the error was thrown — would be the second.
	// V8 only; elsewhere the stack keeps the extra frame and nothing else changes.
	Error.captureStackTrace?.(error, createError);

	// The class was chosen by the same code the return type is derived from, so
	// the instance is the one `KindOf` names; the compiler cannot follow a value
	// looked up by a generic key back to its type.
	return Object.assign(error, { code }) as unknown as CodedError<KindOf<TCode>>;
};
