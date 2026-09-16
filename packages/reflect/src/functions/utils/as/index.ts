import { refuseUnresolved, type TypeTest } from '@/functions/utils/is';

/**
 * Names the type of a value, for the error thrown when nothing more precise is
 * available.
 *
 * @param value Value being described.
 * @returns The name of its class where it has one, otherwise what `typeof`
 * answers.
 */
const describe = (value: unknown): string => {
	if (value === null) return 'null';

	if (typeof value === 'object') {
		const named = value.constructor as { name?: string } | undefined;

		return named?.name ?? 'object';
	}

	return typeof value;
};

/**
 * Returns a value as a type, refusing if it is not one.
 *
 * The checked counterpart of the language's `as`, which asserts without
 * verifying: `payload as Order` compiles whatever `payload` turns out to be,
 * and the mistake surfaces later, somewhere else, as a property of `undefined`.
 *
 * ```ts
 * const order = as<Order>(await response.json());
 * ```
 *
 * The value is returned unchanged when it matches — the same object, not a
 * copy. When it does not, the error names **where** it stopped matching rather
 * than only that it did:
 *
 * ```text
 * as<Order>() refused a value: customer.email: expected string, got number
 * ```
 *
 * That message is built by a second walker the transformer emits beside the
 * check, and it runs only once the check has already refused — so a value that
 * passes never pays for it.
 *
 * Use `is` when a failure should branch the program rather than stop it.
 *
 * @template T Type being asserted.
 * @param value Value being checked.
 * @param test Filled in by the transformer. Pass one by hand for a type it
 * refuses.
 * @returns The same value, typed as `T`.
 * @throws {Error} When the call was not resolved at compile time.
 * @throws {TypeError} When the value is not a `T`.
 */
export const as = <T>(value: unknown, test?: TypeTest<T>): T => {
	if (test === undefined) refuseUnresolved('as');

	if (test.matches(value)) return value as T;

	const named: string = test.name ?? 'the type';
	const where: string | null = test.explain?.(value) ?? null;

	throw new TypeError(
		where === null
			? `as<${named}>() refused a value of type ${describe(value)}.`
			: `as<${named}>() refused a value: ${where}`,
	);
};
