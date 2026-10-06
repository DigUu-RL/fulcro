/**
 * The class an error is thrown as.
 *
 * Kept as the built-in class the error had before it carried a code, so a
 * consumer's `instanceof RangeError` goes on matching: the code is added to
 * the error, never substituted for its class.
 */
export type ErrorKind = new (message?: string, options?: ErrorOptions) => Error;

/**
 * A value an error's details may hold.
 *
 * Primitives only. An error outlives the call that threw it — in a log, in
 * telemetry, across a worker boundary, where it is cloned — and a detail
 * holding the array a caller passed in, or one of their records, would keep it
 * alive and carry it wherever the error goes. A value of any other kind is
 * described as text before it becomes a detail.
 */
export type DetailValue = string | number | bigint | boolean | null | undefined;

/**
 * What every error's details look like: named values, primitives or arrays of
 * them, and always the operation that failed.
 *
 * `operation` is required so a consumer can read it from any Fulcro error
 * without first narrowing by code.
 */
export interface DetailsShape {
	/** The operation that failed, as a consumer calls it. */
	readonly operation: string;

	readonly [field: string]: DetailValue | readonly DetailValue[];
}

/**
 * One entry of the catalog: the class an error is thrown as, and the text
 * after its code.
 *
 * The text is a function so the details that make a message actionable — the
 * index, the field, what was received — are formatted only when the error is
 * actually created, never when the catalog is loaded. The object it takes is
 * the error's `details`, so the fields are declared once, by the template.
 */
export interface ErrorDefinition {
	readonly kind: ErrorKind;

	// Declared as a method, not as a property holding a function, on purpose:
	// a method's parameter is compared both ways, so a template taking
	// `{ operation: string; index: number }` satisfies this while its own
	// parameter stays exactly as written — which is what `createError` infers
	// the details back from. A template whose details are not a `DetailsShape`
	// in either direction — no `operation`, or a field holding an object — is
	// still refused.
	message(details: DetailsShape): string;

	/**
	 * Which of the details is the error's `cause`, for a code that stands in
	 * for something else that went wrong.
	 *
	 * Declared per code rather than passed at each call, so every place that
	 * throws the code keeps the cause the same way. Present means a `cause` is
	 * always set, even to `undefined` — a thrown `undefined` is still what was
	 * thrown.
	 */
	cause?(details: DetailsShape): unknown;
}

/** A single decimal digit, as the codes are spelled. */
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/**
 * The codes of one package's range.
 *
 * Each catalog file is checked against its own range with `satisfies`, which
 * is what makes a code outside it a compile error in the file that declared
 * it rather than a collision noticed after both were released.
 *
 * @template TRange The range's leading digit, `1` for `FULCRO1xxx`.
 */
export type CodeRange<TRange extends Digit> =
	`FULCRO${TRange}${Digit}${Digit}${Digit}`;

/**
 * The shape every catalog file satisfies.
 *
 * @template TRange The range's leading digit.
 */
export type RangeCatalog<TRange extends Digit> = Readonly<
	Partial<Record<CodeRange<TRange>, ErrorDefinition>>
>;
