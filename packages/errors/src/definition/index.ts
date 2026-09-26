/**
 * The class an error is thrown as.
 *
 * Kept as the built-in class the error had before it carried a code, so a
 * consumer's `instanceof RangeError` goes on matching: the code is added to
 * the error, never substituted for its class.
 */
export type ErrorKind = new (message?: string, options?: ErrorOptions) => Error;

/**
 * One entry of the catalog: the class an error is thrown as, and the text
 * after its code.
 *
 * The text is a function so the values that make a message actionable — the
 * index, the field, what was received — are formatted only when the error is
 * actually created, never when the catalog is loaded.
 */
export interface ErrorDefinition {
	readonly kind: ErrorKind;

	// `never[]` is what lets a template with any parameter list satisfy the
	// catalog's constraint while its own parameters stay exactly as written, so
	// `createError` can infer them back from the code.
	readonly message: (...parameters: never[]) => string;

	/**
	 * Which of the values is the error's `cause`, for a code that stands in for
	 * something else that went wrong.
	 *
	 * Declared per code rather than passed at each call, so every place that
	 * throws the code keeps the cause the same way. Present means a `cause` is
	 * always set, even to `undefined` — a thrown `undefined` is still what was
	 * thrown.
	 */
	readonly cause?: (...parameters: never[]) => unknown;
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
