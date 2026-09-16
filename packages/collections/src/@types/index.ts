/**
 * Tests an element against a condition.
 *
 * @template T Type of the evaluated element.
 * @param value Element being evaluated.
 * @returns `true` when the element satisfies the condition, otherwise `false`.
 */
export type Predicate<T> = (value: T) => boolean;

/**
 * Projects an element into another shape.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value.
 */
export type Selector<T, R> = (value: T) => R;

/**
 * Projects an element into another shape, or into nothing at all.
 *
 * `null` and `undefined` mean "no result for this element" rather than being
 * results in their own right, which is what lets a projection also decide what
 * to drop.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value, or `null` or `undefined` to skip the element.
 */
export type OptionalSelector<T, R> = (value: T) => R | null | undefined;

/**
 * The primitive type names `typeof` answers with, mapped to what each one
 * means as a type.
 *
 * Used to filter a sequence by a runtime type without a schema or a compiler
 * plugin: the name is the same string the language itself uses.
 */
export interface TypeNames {
	string: string;
	number: number;
	bigint: bigint;
	boolean: boolean;
	symbol: symbol;
	function: (...args: never[]) => unknown;
	object: object | null;
	undefined: undefined;
}

/**
 * Anything that can be called with `new`, used to filter a sequence by class.
 *
 * @template T Type produced by the constructor.
 */
export type Constructor<T> = abstract new (...args: never[]) => T;

/**
 * A test deciding whether a value is of some type, by looking at its shape.
 *
 * This is what the transformer of this package emits for a type that has no
 * single runtime token — an interface, an object literal type, a union — after
 * reading the type at compile time and writing out the checks its properties
 * imply.
 *
 * Deliberately an object rather than a bare function. A class is a function
 * too, and telling one from a predicate at runtime is guesswork that breaks on
 * transpiled classes; a wrapper makes the two impossible to confuse.
 *
 * It is also usable by hand, and is the escape hatch for a type the transformer
 * refuses: write the check yourself and the operators treat it exactly the same.
 *
 * @template R Type a passing value is taken to be.
 */
export interface TypeTest<R> {
	/**
	 * Decides whether a value is an `R`.
	 *
	 * @param value Value being tested.
	 * @returns `true` when the value is of that type.
	 */
	readonly matches: (value: unknown) => boolean;

	/**
	 * Name of the type, for the error `cast` throws.
	 *
	 * The transformer fills it in with the type as written, so the message names
	 * `Account` rather than something generic.
	 */
	readonly name?: string;

	/** Present so a structural test cannot be mistaken for anything else. */
	readonly __fulcroTypeTest?: true;
}

/**
 * Everything `ofType` and `cast` accept as "the type to look for".
 *
 * Three forms, in increasing order of what they can express: the name `typeof`
 * answers with, a class to test with `instanceof`, or a test over the shape.
 *
 * @template R Type being looked for.
 */
export type TypeToken<R = unknown> =
	keyof TypeNames | Constructor<R> | TypeTest<R>;

/**
 * Narrows `T` to the members assignable to `R`, keeping `R` when the two have
 * nothing in common.
 *
 * The fallback is what makes filtering a `Sequence<unknown>` useful: `Extract`
 * alone would answer `never` there, leaving a sequence that cannot be read.
 *
 * @template T Type being narrowed.
 * @template R Type narrowed to.
 */
export type Narrowed<T, R> = Extract<T, R> extends never ? R : Extract<T, R>;

/**
 * Compares two elements in order to sort them.
 *
 * @template T Type of the compared elements.
 * @param left Element placed on the left side of the comparison.
 * @param right Element placed on the right side of the comparison.
 * @returns A negative number when `left` comes first, a positive number when
 * `right` comes first, and `0` when both elements are equivalent.
 */
export type Comparer<T> = (left: T, right: T) => number;

/**
 * Consumes an element together with its positional index.
 *
 * @template T Type of the consumed element.
 * @param value Element being consumed.
 * @param index Zero based position of the element in the sequence.
 */
export type Action<T> = (value: T, index: number) => void;

/**
 * Merges a pair of correlated elements into a single result.
 *
 * @template O Type of the outer element.
 * @template I Type of the inner element.
 * @template R Type of the produced result.
 * @param outer Element coming from the outer sequence.
 * @param inner Element coming from the inner sequence.
 * @returns The merged result.
 */
export type ResultSelector<O, I, R> = (outer: O, inner: I) => R;

/**
 * Merges a pair of correlated elements, possibly after waiting.
 *
 * @template O Type of the outer element.
 * @template I Type of the inner element.
 * @template R Type of the produced result.
 * @param outer Element coming from the outer sequence.
 * @param inner Element coming from the inner sequence.
 * @returns The merged result, or a promise of it.
 */
export type AsyncResultSelector<O, I, R> = (
	outer: O,
	inner: I,
) => R | PromiseLike<R>;

/**
 * Accumulates a sequence into a single value.
 *
 * @template A Type of the accumulated value.
 * @template T Type of the aggregated elements.
 * @param accumulator Value accumulated so far.
 * @param item Element being aggregated.
 * @returns The new accumulated value.
 */
export type Accumulator<A, T> = (accumulator: A, item: T) => A;

/**
 * Tests an element against a condition that may need to wait.
 *
 * Every asynchronous operator takes this form rather than the synchronous one,
 * so a plain predicate works unchanged and an awaited one needs no separate
 * operator to call it from.
 *
 * @template T Type of the evaluated element.
 * @param value Element being evaluated.
 * @returns `true` when the element satisfies the condition, or a promise of it.
 */
export type AsyncPredicate<T> = (value: T) => boolean | PromiseLike<boolean>;

/**
 * Projects an element into another shape, possibly after waiting.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value, or a promise of it.
 */
export type AsyncSelector<T, R> = (value: T) => R | PromiseLike<R>;

/**
 * Projects an element into another shape, or into nothing, possibly after
 * waiting.
 *
 * @template T Type of the source element.
 * @template R Type produced by the projection.
 * @param value Element being projected.
 * @returns The projected value, or `null` or `undefined` to skip the element,
 * or a promise of either.
 */
export type AsyncOptionalSelector<T, R> = (
	value: T,
) => R | null | undefined | PromiseLike<R | null | undefined>;

/**
 * Consumes an element together with its positional index, possibly after
 * waiting.
 *
 * @template T Type of the consumed element.
 * @param value Element being consumed.
 * @param index Zero based position of the element in the sequence.
 * @returns Nothing, or a promise that settles when the element is dealt with.
 */
export type AsyncAction<T> = (
	value: T,
	index: number,
) => void | PromiseLike<void>;

/**
 * Accumulates a sequence into a single value, possibly waiting on each step.
 *
 * @template A Type of the accumulated value.
 * @template T Type of the aggregated elements.
 * @param accumulator Value accumulated so far.
 * @param item Element being aggregated.
 * @returns The new accumulated value, or a promise of it.
 */
export type AsyncAccumulator<A, T> = (
	accumulator: A,
	item: T,
) => A | PromiseLike<A>;

/**
 * What a terminal operator of an asynchronous sequence accepts beyond its own
 * arguments.
 *
 * Cancellation lives here rather than on the deferred operators or on the
 * factory, because it is a property of *consuming* a sequence rather than of
 * describing one: the terminal is where the waiting happens and where the
 * promise that rejects lives, so the same sequence can be consumed twice under
 * different signals.
 */
export interface TerminalOptions {
	/**
	 * Signal calling the consumption off.
	 *
	 * Aborting does two things and cannot do a third. No further element is
	 * pulled, and the returned promise rejects with the reason the signal
	 * carries. Work already in flight keeps running to completion — a promise
	 * has no cancel, and nothing here can invent one — and its result is
	 * discarded. A selector that takes a signal of its own is handed this one,
	 * and that work does stop.
	 */
	readonly signal?: AbortSignal;
}

/**
 * How many elements an operator may have in flight at once, and in what order
 * it hands back the results.
 *
 * Only the operators whose names end in `Await` take this. The others process
 * one element at a time, which is the right default and needs no configuring.
 */
export interface ConcurrencyOptions {
	/**
	 * Maximum amount of elements worked on at the same time.
	 *
	 * Required, with no default, and that is on purpose. Unbounded is how rate
	 * limits get hit and file descriptors run out — and it fails in production
	 * rather than in development, where the input is small. A default of `1`
	 * would make the operator pointless. Anything in between would be a guess
	 * about a service only the caller knows.
	 *
	 * Must be a positive integer.
	 */
	readonly concurrency: number;

	/**
	 * Whether results come back in the order their inputs went in.
	 *
	 * `true` by default, because it is the behaviour that composes: an operator
	 * in the middle of a chain should not quietly change what a later `zip` or
	 * `pairwise` is pairing. A slow element then holds back the ones behind it,
	 * though they still *ran* concurrently — the wait is overlapped either way.
	 *
	 * Set it to `false` to have each result handed over as it finishes, which
	 * removes that head-of-line blocking at the cost of an order that no longer
	 * corresponds to the input.
	 */
	readonly ordered?: boolean;
}
