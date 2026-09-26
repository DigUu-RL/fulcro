import { createError } from '@fulcro/errors';

import { Predicate, TypeNames, TypeTest, TypeToken } from '@/@types';

/**
 * What `ofType` and `cast` do with the token they are given.
 *
 * Shared by both kinds of sequence rather than written once each. The question
 * "is this value of that type" has one answer, and two copies of it would be
 * two chances for the synchronous and asynchronous operators to disagree about
 * something a consumer would reasonably expect to be the same operator.
 */

/**
 * Tells whether a token is a shape test rather than a name or a class.
 *
 * @template R Type the test is for.
 * @param type Token handed to the operator.
 * @returns `true` when the token carries its own test.
 */
export const isTypeTest = <R>(type: TypeToken): type is TypeTest<R> =>
	typeof type === 'object' &&
	type !== null &&
	typeof (type as TypeTest<R>).matches === 'function';

/**
 * Turns a token into the test the operators run for each element.
 *
 * @param type Token handed to the operator, or nothing.
 * @param operator Name of the calling operator, for the error.
 * @returns A predicate deciding whether a value is of that type.
 * @throws {Error} When no token arrived, which means the type argument form was
 * never resolved.
 */
export const resolveTypeTest = (
	type: TypeToken | undefined,
	operator: string,
): Predicate<unknown> => {
	// The type argument form, arriving unresolved. From here the two ways that
	// can happen are indistinguishable, so both are named: the plugin was not
	// wired up, or it was and the type had no runtime form to test for. Refused
	// rather than guessed, because every guess available here — keeping
	// everything, keeping nothing — is silently wrong.
	if (type === undefined) {
		throw createError('FULCRO1016', operator);
	}

	// A shape test, which is what the transformer emits for a type with no
	// single runtime token. Checked before the constructor case because a class
	// is a function and this is an object, so the two can never be confused
	// either way round.
	if (isTypeTest(type)) {
		const { matches } = type;

		return (item): boolean => matches(item);
	}

	if (typeof type !== 'string') {
		return (item): boolean => item instanceof type;
	}

	// `typeof null` is `'object'`, which is the one answer the language gives
	// that nobody filtering by type wants: a sequence narrowed to objects that
	// then throws on a property access would be a trap.
	if (type === 'object') {
		return (item): boolean => item !== null && typeof item === 'object';
	}

	return (item): boolean => typeof item === (type as keyof TypeNames);
};

/**
 * Names what a token was asking for, for the error `cast` throws.
 *
 * @param type Token handed to the operator.
 * @returns The type as written, where it is known.
 */
export const describeExpected = (type: TypeToken): string => {
	if (isTypeTest(type)) return type.name ?? 'the type';

	return typeof type === 'string' ? type : type.name;
};

/**
 * Names the type of a value, for an error message.
 *
 * @param value Value being described.
 * @returns The name of its class where it has one, otherwise what `typeof`
 * answers.
 */
export const describeType = (value: unknown): string => {
	if (value === null) return 'null';

	if (typeof value === 'object') {
		const named = value.constructor as { name?: string } | undefined;

		return named?.name ?? 'object';
	}

	return typeof value;
};
