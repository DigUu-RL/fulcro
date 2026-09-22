/**
 * The value a `Decimal` holds, taken apart.
 *
 * Every operation of `Decimal` works on these, and the class only wraps them.
 * They are kept **normalised**: a finite coefficient never ends in a zero
 * unless it is zero, and a zero or a special value has an exponent of zero.
 * That makes equality structural and printing unambiguous, and it is the
 * representation the TC39 proposal's "normalise on the way out" implies — no
 * operation can observe a trailing zero, so none has to carry one.
 */

/** Which of the three kinds of value the parts describe. */
export type DecimalKind = 'finite' | 'infinity' | 'nan';

/** A decimal value: (-1)^negative × coefficient × 10^exponent. */
export interface DecimalParts {
	/** Whether the value is finite, an infinity, or not a number. */
	readonly kind: DecimalKind;

	/** The sign bit, set for negative values, `-0` and `-Infinity`. */
	readonly negative: boolean;

	/** The significant digits, as an integer with no trailing zero. */
	readonly coefficient: bigint;

	/** Power of ten the coefficient is scaled by. */
	readonly exponent: number;
}

/** Significant decimal digits a decimal128 value holds. */
export const PRECISION = 34;

/**
 * Largest exponent of the leading digit, emax in IEEE 754: the largest finite
 * value is 9.999…9 × 10^6144.
 */
export const MAXIMUM_ADJUSTED_EXPONENT = 6144;

/**
 * Smallest exponent of the last digit, the quantum of the smallest subnormal:
 * 1 × 10^-6176. Anything finer rounds.
 */
export const MINIMUM_EXPONENT = -6176;

/** Not a number. Its sign is never observed, so it is always clear. */
export const NOT_A_NUMBER: DecimalParts = {
	kind: 'nan',
	negative: false,
	coefficient: 0n,
	exponent: 0,
};

/**
 * An infinity.
 *
 * @param negative Whether it is negative.
 * @returns The parts.
 */
export const infinity = (negative: boolean): DecimalParts => ({
	kind: 'infinity',
	negative,
	coefficient: 0n,
	exponent: 0,
});

/**
 * A zero.
 *
 * @param negative Whether it is `-0`.
 * @returns The parts.
 */
export const zero = (negative: boolean): DecimalParts => ({
	kind: 'finite',
	negative,
	coefficient: 0n,
	exponent: 0,
});

/**
 * Tells whether finite parts are zero.
 *
 * @param parts Parts to inspect.
 * @returns `true` for `0` and `-0`.
 */
export const isZero = (parts: DecimalParts): boolean =>
	parts.kind === 'finite' && parts.coefficient === 0n;

/** Powers of ten already computed, since every operation reaches for them. */
const POWERS_OF_TEN: bigint[] = [1n];

/**
 * 10 to a power.
 *
 * Cached up to what the arithmetic actually uses — about a hundred, since no
 * aligned operand is allowed past that — and computed beyond it.
 *
 * @param exponent Non-negative power.
 * @returns 10^exponent.
 */
export const powerOfTen = (exponent: number): bigint => {
	if (exponent > 128) return 10n ** BigInt(exponent);

	while (POWERS_OF_TEN.length <= exponent) {
		POWERS_OF_TEN.push(POWERS_OF_TEN[POWERS_OF_TEN.length - 1] * 10n);
	}

	return POWERS_OF_TEN[exponent];
};

/**
 * Number of decimal digits in a non-negative integer.
 *
 * @param value Integer to measure.
 * @returns Its digit count, 1 for zero.
 */
export const digitCount = (value: bigint): number => value.toString().length;

/**
 * Exponent of the leading digit of finite, non-zero parts: 2 for 123, -1 for
 * 0.5. Two values compare in magnitude by this first.
 *
 * @param parts Parts to inspect.
 * @returns The adjusted exponent.
 */
export const adjustedExponent = (parts: DecimalParts): number =>
	parts.exponent + digitCount(parts.coefficient) - 1;
