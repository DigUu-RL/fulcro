import { Catalog, catalog } from '@/catalog';
import { DetailsShape, ErrorDefinition } from '@/definition';
import type { FulcroError } from '@/fulcroError';

/**
 * Every code a `@fulcro` package can throw, `FULCRO` followed by four digits.
 *
 * The leading digit names the package: 1 collections, 2 functions, 3 parallel,
 * 4 reflect, 5 transform-core, 6 types, 7 memory. A code is never reused, even
 * after the error it named is gone, so matching on one stays safe across
 * versions.
 */
export type ErrorCode = keyof Catalog;

/**
 * The details an error of one code carries: the values its message was built
 * from, by name.
 *
 * ```ts
 * const report = (details: DetailsOf<'FULCRO7002'>): string =>
 * 	`${details.operation} asked for ${details.index} of ${details.length}`;
 * ```
 *
 * Every code's details have an `operation`; the other fields are the code's
 * own, and `docs/errors/` lists them.
 *
 * @template TCode The code.
 */
export type DetailsOf<TCode extends ErrorCode> = Readonly<
	Parameters<Catalog[TCode]['message']>[0]
>;

/**
 * An error thrown by a `@fulcro` package, as it was named before it carried
 * its details.
 *
 * @deprecated Use {@link FulcroError}, which also carries `details`. Removed
 * in the next major version.
 * @template TError The class the error is an instance of.
 */
export type CodedError<TError extends Error = Error> = TError & FulcroError;

/** The class the error of a code is created as. */
type KindOf<TCode extends ErrorCode> = InstanceType<Catalog[TCode]['kind']>;

/**
 * The codes whose template takes no details object. Empty, which the
 * declaration below proves: a template with no parameter satisfies the
 * catalog's constraint, and would give its code no `operation` to report.
 */
type WithoutDetails = {
	[TCode in ErrorCode]: Parameters<Catalog[TCode]['message']> extends [
		DetailsShape,
	]
		? never
		: TCode;
}[ErrorCode];

// Fails to compile, naming the code, when a template takes no details.
const everyTemplateTakesDetails: [WithoutDetails] extends [never]
	? true
	: WithoutDetails = true;

void everyTemplateTakesDetails;

/**
 * Creates the error a code names, ready to be thrown.
 *
 * ```ts
 * throw createError('FULCRO6021', { operation: 'Vector3.from', field: 'x' });
 * // TypeError: FULCRO6021: Vector3.from: missing field 'x'.
 * ```
 *
 * The message starts with the code, and the code and the details are also on
 * the error as `code` and `details`: the message is for whoever reads the log,
 * the properties for the code that catches it.
 *
 * `details` is the very object passed in, frozen — not a copy — so it is the
 * one the message was built from.
 *
 * @template TCode The code being thrown.
 * @param code A registered code; an unregistered one does not compile.
 * @param details What the code's message is built from, as its template
 * declares them.
 * @returns The error, of the class the code is registered with.
 */
export const createError = <TCode extends ErrorCode>(
	code: TCode,
	details: DetailsOf<TCode>,
): FulcroError<TCode> & KindOf<TCode> => {
	const definition: ErrorDefinition = catalog[code];

	// The catalog's templates are typed one by one, and `details` was checked
	// against the right one at the call site; here they only need to meet.
	const fields = Object.freeze(details) as DetailsShape;
	const text: string = definition.message(fields);

	const error: Error = new definition.kind(
		`${code}: ${text}`,
		definition.cause === undefined
			? undefined
			: { cause: definition.cause(fields) },
	);

	// Without this the first frame of every stack would be this function, and
	// the line a reader wants — where the error was thrown — would be the second.
	// V8 only; elsewhere the stack keeps the extra frame and nothing else changes.
	Error.captureStackTrace?.(error, createError);

	// The class was chosen by the same code the return type is derived from, so
	// the instance is the one `KindOf` names; the compiler cannot follow a value
	// looked up by a generic key back to its type.
	return Object.assign(error, {
		code,
		details: fields,
	}) as unknown as FulcroError<TCode> & KindOf<TCode>;
};
