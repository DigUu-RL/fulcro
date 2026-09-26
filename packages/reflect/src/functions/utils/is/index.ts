import { createError } from '@fulcro/errors';

/**
 * A test deciding whether a value is of some type, by looking at its shape.
 *
 * What the transformer emits for a type argument, after reading the type at
 * compile time and writing out the checks its properties imply. Declared here
 * rather than imported so that nothing a consumer touches depends on the
 * compile time packages.
 *
 * It is also writable by hand, and is the escape hatch for a type the
 * transformer refuses — `is` and `as` treat it exactly the same either way.
 *
 * Lives beside `is` rather than in a module of its own because `is` is the
 * question underneath both: `as` asks it and then decides what to do with the
 * answer.
 *
 * @template T Type a passing value is taken to be.
 */
export interface TypeTest<T> {
	/**
	 * Decides whether a value is a `T`.
	 *
	 * @param value Value being tested.
	 * @returns `true` when the value is of that type.
	 */
	readonly matches: (value: unknown) => boolean;

	/**
	 * Names where a value stopped being a `T`.
	 *
	 * Only `as` asks for this, and only after {@link TypeTest.matches} has
	 * already refused — so the cost of producing a good message is paid solely
	 * by values that were wrong.
	 *
	 * @param value Value that failed.
	 * @returns The path and reason, or `null` when it cannot say.
	 */
	readonly explain?: (value: unknown) => string | null;

	/** Name of the type, as it was written. */
	readonly name?: string;
}

/**
 * Refuses a call the transformer did not resolve.
 *
 * Shared with `as`, which fails the same way for the same reasons.
 *
 * Annotated on the variable rather than only on the arrow, which is what makes
 * TypeScript treat a call to it as ending the flow — otherwise every caller has
 * to prove again that the argument is present.
 *
 * @param operator Name of the calling utility.
 * @throws {Error} Always.
 */
export const refuseUnresolved: (operator: string) => never = (
	operator: string,
): never => {
	// From here the two ways a call can arrive unresolved are
	// indistinguishable, so both are named. Guessing between them would be
	// presenting a coin toss as a diagnosis.
	throw createError('FULCRO4002', operator);
};

/**
 * Tells whether a value really is of a type.
 *
 * The check TypeScript cannot perform on its own: a type is gone by the time
 * the value arrives, so nothing at runtime knows what shape was promised. The
 * transformer reads the type while the compiler still has it and writes the
 * check out — every property, nested objects, every element of an array.
 *
 * ```ts
 * if (is<Order>(payload)) {
 * 	payload.total; // narrowed, and actually verified
 * }
 * ```
 *
 * This is a **type guard**, so a passing value is narrowed from there on. Use
 * `as` when a failure should stop the program rather than branch it.
 *
 * Needs the transformer. Without it the call refuses rather than guessing,
 * because a check that answers `true` for the wrong thing is worse than no
 * check at all — it is false confidence at exactly the boundary where the data
 * is least trustworthy.
 *
 * @template T Type being checked for.
 * @param value Value being tested.
 * @param test Filled in by the transformer. Pass one by hand for a type it
 * refuses.
 * @returns `true` when the value is a `T`.
 * @throws {Error} When the call was not resolved at compile time.
 */
export const is = <T>(value: unknown, test?: TypeTest<T>): value is T => {
	if (test === undefined) refuseUnresolved('is');

	return test.matches(value);
};
