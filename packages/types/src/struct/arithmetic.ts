/**
 * Arithmetic on number literals, at the type level, for the layout a struct
 * type declares.
 *
 * `sizeOf<T>()` answers from the literal in `T['~layout']`, so a struct type
 * has to carry its size as a literal, and that literal is a sum of its fields
 * rounded up to its alignment. TypeScript has no arithmetic on literals; this
 * module is the smallest amount of it the layout needs.
 *
 * Addition works digit by digit on the decimal text of a number, so it is not
 * bounded by the recursion limit the way counting a tuple up to the sum would
 * be. Rounding needs a remainder, and the remainder by an alignment — a power
 * of two up to sixteen — depends only on the last four digits, since sixteen
 * divides ten thousand; so no tuple built here is ever longer than 9,999.
 *
 * Wherever an input is `number` rather than a literal, the answer is `number`:
 * `sizeOf` then refuses the type rather than report a wrong size.
 */

/** A decimal digit, as text. */
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** The value of each digit. */
interface DigitValues {
	readonly '0': 0;
	readonly '1': 1;
	readonly '2': 2;
	readonly '3': 3;
	readonly '4': 4;
	readonly '5': 5;
	readonly '6': 6;
	readonly '7': 7;
	readonly '8': 8;
	readonly '9': 9;
}

/**
 * A tuple of `N` elements, for the small `N` a digit or an alignment needs.
 *
 * @template N Length, from 0 to 19.
 */
type Units<
	N extends number,
	TAccumulated extends unknown[] = [],
> = TAccumulated['length'] extends N
	? TAccumulated
	: Units<N, [...TAccumulated, unknown]>;

/** Ten elements, the carry out of a digit. */
type Ten = Units<10>;

/**
 * Adds two digits and a carry.
 *
 * @template TLeft First digit.
 * @template TRight Second digit.
 * @template TCarry Carry into this digit.
 * @returns `[digit, carry]` of the sum.
 */
type AddDigits<
	TLeft extends Digit,
	TRight extends Digit,
	TCarry extends 0 | 1,
> = [
	...Units<DigitValues[TLeft]>,
	...Units<DigitValues[TRight]>,
	...Units<TCarry>,
] extends infer TAll extends unknown[]
	? TAll extends [...Ten, ...infer TRest]
		? [`${TRest['length']}`, 1]
		: [`${TAll['length']}`, 0]
	: never;

/** First character of a text, `'0'` once it is empty. */
type Head<TText extends string> =
	TText extends `${infer THead extends Digit}${string}` ? THead : '0';

/** A text without its first character. */
type Tail<TText extends string> = TText extends `${Digit}${infer TTail}`
	? TTail
	: '';

/**
 * Adds two numbers written least significant digit first.
 *
 * @returns The sum, least significant digit first.
 */
type AddReversed<
	TLeft extends string,
	TRight extends string,
	TCarry extends 0 | 1 = 0,
	TSum extends string = '',
> = TLeft extends ''
	? TRight extends ''
		? TCarry extends 1
			? `${TSum}1`
			: TSum
		: AddStep<TLeft, TRight, TCarry, TSum>
	: AddStep<TLeft, TRight, TCarry, TSum>;

/** One digit of {@link AddReversed}. */
type AddStep<
	TLeft extends string,
	TRight extends string,
	TCarry extends 0 | 1,
	TSum extends string,
> =
	AddDigits<Head<TLeft>, Head<TRight>, TCarry> extends [
		infer TDigit extends string,
		infer TNext extends 0 | 1,
	]
		? AddReversed<Tail<TLeft>, Tail<TRight>, TNext, `${TSum}${TDigit}`>
		: never;

/** A text, backwards. */
type Reverse<
	TText extends string,
	TReversed extends string = '',
> = TText extends `${infer THead}${infer TTail}`
	? Reverse<TTail, `${THead}${TReversed}`>
	: TReversed;

/** The number a text of digits spells. */
type ToNumber<TText extends string> = TText extends `${infer N extends number}`
	? N
	: never;

/**
 * The sum of two number literals; `number` when either is not a literal.
 *
 * @template TLeft First operand, a non-negative integer.
 * @template TRight Second operand, a non-negative integer.
 */
export type Add<TLeft extends number, TRight extends number> = number extends
	TLeft | TRight
	? number
	: ToNumber<Reverse<AddReversed<Reverse<`${TLeft}`>, Reverse<`${TRight}`>>>>;

/**
 * A tuple as long as a number of up to four digits, built one digit at a time
 * — ten copies of what came before, and the digit — so its depth is the number
 * of digits rather than the number itself.
 */
type TupleOf<
	TDigits extends string,
	TAccumulated extends unknown[] = [],
> = TDigits extends `${infer THead extends Digit}${infer TTail}`
	? TupleOf<
			TTail,
			[
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...TAccumulated,
				...Units<DigitValues[THead]>,
			]
		>
	: TAccumulated;

/** The last `N` characters of a text written least significant first. */
type Take<
	TText extends string,
	N extends number,
	TTaken extends string = '',
	TCount extends unknown[] = [],
> = TCount['length'] extends N
	? TTaken
	: TText extends `${infer THead}${infer TTail}`
		? Take<TTail, N, `${THead}${TTaken}`, [...TCount, unknown]>
		: TTaken;

/** Digits of a number that decide its remainder by each alignment. */
interface RemainderDigits {
	readonly 2: 1;
	readonly 4: 2;
	readonly 8: 3;
	readonly 16: 4;
}

/** How many elements are left of a tuple once whole chunks are taken off it. */
type Leftover<
	TTuple extends unknown[],
	TChunk extends unknown[],
> = TTuple extends [...TChunk, ...infer TRest]
	? Leftover<TRest, TChunk>
	: TTuple['length'];

/**
 * The remainder of a number by an alignment.
 *
 * @template N A non-negative integer literal.
 * @template TAlignment 2, 4, 8 or 16.
 */
type Remainder<
	N extends number,
	TAlignment extends keyof RemainderDigits,
> = Leftover<
	TupleOf<Take<Reverse<`${N}`>, RemainderDigits[TAlignment]>>,
	Units<TAlignment>
>;

/**
 * A number rounded up to a multiple of an alignment: the size of a struct once
 * its tail padding is added.
 *
 * @template N Size before padding.
 * @template TAlignment Alignment of the struct, a power of two up to 16.
 */
export type RoundUp<
	N extends number,
	TAlignment extends number,
> = number extends N | TAlignment
	? number
	: TAlignment extends keyof RemainderDigits
		? Remainder<N, TAlignment> extends infer TRemainder extends number
			? TRemainder extends 0
				? N
				: Units<TAlignment> extends [...Units<TRemainder>, ...infer TPadding]
					? Add<N, TPadding['length']>
					: never
			: never
		: N;

/**
 * The largest of a union of alignments.
 *
 * @template TAlignments Alignments of the fields, each a power of two up to 16.
 */
export type LargestAlignment<TAlignments extends number> =
	number extends TAlignments
		? number
		: 16 extends TAlignments
			? 16
			: 8 extends TAlignments
				? 8
				: 4 extends TAlignments
					? 4
					: 2 extends TAlignments
						? 2
						: 1;
