import type { RoundingMode } from '@/roundingMode';

import {
	adjustedExponent,
	type DecimalParts,
	digitCount,
	infinity,
	isZero,
	MAXIMUM_ADJUSTED_EXPONENT,
	MINIMUM_EXPONENT,
	NOT_A_NUMBER,
	powerOfTen,
	PRECISION,
	zero,
} from './parts';
import { discardDigits, finish } from './round';

/**
 * The operations of `Decimal`, on parts.
 *
 * Each one computes an exact result on integers and hands it to `finish`, which
 * rounds it into the format once. The care is in keeping "exact" affordable: a
 * decimal128 exponent spans more than twelve thousand powers of ten, and an
 * operation that aligned two operands by multiplying one of them out would
 * build a twelve-thousand-digit integer to add 1 to 10^6000. None of the
 * operations below lets an intermediate grow past about a hundred digits,
 * whatever the exponents, and the performance suite holds them to it.
 */

/**
 * Adds two values.
 *
 * @param left First operand.
 * @param right Second operand.
 * @param mode Rounding mode.
 * @returns The rounded sum.
 */
export const addParts = (
	left: DecimalParts,
	right: DecimalParts,
	mode: RoundingMode,
): DecimalParts => {
	if (left.kind === 'nan' || right.kind === 'nan') return NOT_A_NUMBER;

	if (left.kind === 'infinity' || right.kind === 'infinity') {
		if (left.kind === 'infinity' && right.kind === 'infinity') {
			return left.negative === right.negative ? left : NOT_A_NUMBER;
		}

		return left.kind === 'infinity' ? left : right;
	}

	if (isZero(left) && isZero(right)) {
		// IEEE 754: a sum of zeros is negative only when both are, or, for zeros
		// of opposite sign, when rounding towards negative infinity.
		const negative: boolean =
			left.negative === right.negative ? left.negative : mode === 'floor';

		return zero(negative);
	}

	if (isZero(left)) return right;
	if (isZero(right)) return left;

	// The larger operand in magnitude of exponent goes first; it decides where
	// the result's last digit can fall.
	const [larger, smaller] =
		adjustedExponent(left) >= adjustedExponent(right)
			? [left, right]
			: [right, left];

	// Exponent of the thirty-fourth digit of the larger operand.
	const lastPlace: number = adjustedExponent(larger) - (PRECISION - 1);

	// An operand below a hundredth of that place can only decide the rounding,
	// never a digit. It is replaced by the smallest non-zero value three places
	// below it, which rounds every way it would have — up, down, or past a
	// borrow — and keeps the alignment below to a few dozen digits instead of
	// one per power of ten between the two.
	const addend: DecimalParts =
		adjustedExponent(smaller) < lastPlace - 2
			? { ...smaller, coefficient: 1n, exponent: lastPlace - 3 }
			: smaller;

	const exponent: number = Math.min(larger.exponent, addend.exponent);

	const signed = (parts: DecimalParts): bigint => {
		const magnitude: bigint =
			parts.coefficient * powerOfTen(parts.exponent - exponent);

		return parts.negative ? -magnitude : magnitude;
	};

	const sum: bigint = signed(larger) + signed(addend);

	// An exact cancellation is +0, except when rounding towards negative
	// infinity, where it is -0.
	if (sum === 0n) return zero(mode === 'floor');

	return finish(sum < 0n, sum < 0n ? -sum : sum, exponent, mode);
};

/**
 * Multiplies two values.
 *
 * The product of two coefficients has at most sixty-eight digits, and the
 * exponents simply add, so nothing here needs guarding.
 *
 * @param left First operand.
 * @param right Second operand.
 * @param mode Rounding mode.
 * @returns The rounded product.
 */
export const multiplyParts = (
	left: DecimalParts,
	right: DecimalParts,
	mode: RoundingMode,
): DecimalParts => {
	const negative: boolean = left.negative !== right.negative;

	if (left.kind === 'nan' || right.kind === 'nan') return NOT_A_NUMBER;

	if (left.kind === 'infinity' || right.kind === 'infinity') {
		return isZero(left) || isZero(right) ? NOT_A_NUMBER : infinity(negative);
	}

	return finish(
		negative,
		left.coefficient * right.coefficient,
		left.exponent + right.exponent,
		mode,
	);
};

/**
 * Divides one value by another.
 *
 * The dividend is scaled so that the quotient has thirty-five digits — one
 * more than the format keeps — and a non-zero remainder is recorded as a
 * thirty-sixth digit of 1. Those two digits are all the rounding reads, so the
 * quotient is rounded exactly as the infinitely precise one would be.
 *
 * Division by zero follows IEEE 754 rather than throwing: a non-zero value over
 * zero is an infinity, and zero over zero is not a number.
 *
 * @param left Dividend.
 * @param right Divisor.
 * @param mode Rounding mode.
 * @returns The rounded quotient.
 */
export const divideParts = (
	left: DecimalParts,
	right: DecimalParts,
	mode: RoundingMode,
): DecimalParts => {
	const negative: boolean = left.negative !== right.negative;

	if (left.kind === 'nan' || right.kind === 'nan') return NOT_A_NUMBER;

	if (left.kind === 'infinity') {
		return right.kind === 'infinity' ? NOT_A_NUMBER : infinity(negative);
	}

	if (right.kind === 'infinity') return zero(negative);

	if (isZero(right)) return isZero(left) ? NOT_A_NUMBER : infinity(negative);
	if (isZero(left)) return zero(negative);

	const shift: number = Math.max(
		0,
		PRECISION +
			1 +
			digitCount(right.coefficient) -
			digitCount(left.coefficient),
	);

	const dividend: bigint = left.coefficient * powerOfTen(shift);
	const quotient: bigint = dividend / right.coefficient;
	const exponent: number = left.exponent - right.exponent - shift;

	if (dividend % right.coefficient === 0n) {
		return finish(negative, quotient, exponent, mode);
	}

	return finish(negative, quotient * 10n + 1n, exponent - 1, mode);
};

/**
 * 10^exponent modulo a value, by repeated squaring.
 *
 * What lets the remainder of 1 × 10^6000 by 7 be found without writing out
 * 10^6000: thirteen squarings of numbers smaller than the divisor.
 *
 * @param exponent Non-negative power of ten.
 * @param modulus Positive modulus.
 * @returns 10^exponent mod modulus.
 */
const powerOfTenModulo = (exponent: number, modulus: bigint): bigint => {
	let result: bigint = 1n % modulus;
	let base: bigint = 10n % modulus;
	let remaining: number = exponent;

	while (remaining > 0) {
		if (remaining % 2 === 1) result = (result * base) % modulus;

		base = (base * base) % modulus;
		remaining = Math.floor(remaining / 2);
	}

	return result;
};

/**
 * The remainder of a division truncated towards zero, carrying the sign of the
 * dividend — what `%` computes on numbers.
 *
 * Always exact: the remainder is smaller than the divisor and no finer than the
 * finer of the two operands, so it always fits the format.
 *
 * @param left Dividend.
 * @param right Divisor.
 * @returns The remainder.
 */
export const remainderParts = (
	left: DecimalParts,
	right: DecimalParts,
): DecimalParts => {
	if (left.kind === 'nan' || right.kind === 'nan') return NOT_A_NUMBER;
	if (left.kind === 'infinity' || isZero(right)) return NOT_A_NUMBER;
	if (right.kind === 'infinity' || isZero(left)) return left;

	// A dividend smaller than the divisor is its own remainder.
	if (adjustedExponent(left) < adjustedExponent(right)) return left;

	let remainder: bigint;
	let exponent: number;

	if (left.exponent >= right.exponent) {
		// The dividend is coefficient × 10^gap in units of the divisor's last
		// place, and the gap can be twelve thousand: reduce the power instead.
		const gap: number = left.exponent - right.exponent;

		remainder =
			(left.coefficient * powerOfTenModulo(gap, right.coefficient)) %
			right.coefficient;
		exponent = right.exponent;
	} else {
		// The divisor's last place is the coarser one. Since the dividend is at
		// least as large, the gap is under thirty-four places.
		remainder =
			left.coefficient %
			(right.coefficient * powerOfTen(right.exponent - left.exponent));
		exponent = left.exponent;
	}

	if (remainder === 0n) return zero(left.negative);

	return finish(left.negative, remainder, exponent, 'halfEven');
};

/**
 * Compares two values in magnitude and sign.
 *
 * @param left First operand.
 * @param right Second operand.
 * @returns -1, 0 or 1, or `undefined` when either is not a number, which is
 * ordered against nothing.
 */
export const compareParts = (
	left: DecimalParts,
	right: DecimalParts,
): -1 | 0 | 1 | undefined => {
	if (left.kind === 'nan' || right.kind === 'nan') return undefined;

	// Both zeros are equal, whatever their signs.
	if (isZero(left) && isZero(right)) return 0;

	const sign = (parts: DecimalParts): -1 | 0 | 1 =>
		isZero(parts) ? 0 : parts.negative ? -1 : 1;

	if (sign(left) !== sign(right)) return sign(left) < sign(right) ? -1 : 1;

	const direction: -1 | 1 = left.negative ? -1 : 1;

	if (left.kind === 'infinity' || right.kind === 'infinity') {
		if (left.kind === right.kind) return 0;

		return left.kind === 'infinity' ? direction : (-direction as -1 | 1);
	}

	const leftAdjusted: number = adjustedExponent(left);
	const rightAdjusted: number = adjustedExponent(right);

	if (leftAdjusted !== rightAdjusted) {
		return leftAdjusted > rightAdjusted ? direction : (-direction as -1 | 1);
	}

	// Same leading exponent, so the alignment is under thirty-four places.
	const exponent: number = Math.min(left.exponent, right.exponent);
	const leftAligned: bigint =
		left.coefficient * powerOfTen(left.exponent - exponent);
	const rightAligned: bigint =
		right.coefficient * powerOfTen(right.exponent - exponent);

	if (leftAligned === rightAligned) return 0;

	return leftAligned > rightAligned ? direction : (-direction as -1 | 1);
};

/** One, the result of any value raised to the power zero. */
const ONE: DecimalParts = {
	kind: 'finite',
	negative: false,
	coefficient: 1n,
	exponent: 0,
};

/**
 * The largest exact power computed, in digits. The exact power of a
 * thirty-four-digit coefficient to `n` has `34n` digits; below this the power is
 * computed exactly and rounded once, above it — a base within a hair of one
 * raised to an enormous exponent, the one way to get here without overflowing —
 * with {@link GUARD_DIGITS} digits more than the format keeps.
 */
const EXACT_DIGIT_LIMIT = 200_000;

/** Digits carried beyond the format's thirty-four when a power is not exact. */
const GUARD_DIGITS = 50;

/**
 * The decimal logarithm of a finite, non-zero magnitude, as a double.
 *
 * Only ever used to rule a power out as an overflow or an underflow before it is
 * computed, with a margin of whole powers of ten around the limits, so the
 * double's own error never decides anything.
 *
 * @param parts Magnitude to measure.
 * @returns log10 of the magnitude.
 */
const decimalLogarithm = (parts: DecimalParts): number => {
	const digits: string = parts.coefficient.toString();
	const leading: string = digits.slice(0, 15);

	return (
		parts.exponent +
		Math.log10(Number(leading)) +
		(digits.length - leading.length)
	);
};

/**
 * A positive integer power computed with a bounded number of digits: every
 * product is cut back to {@link GUARD_DIGITS} beyond the format, and a digit
 * of 1 is kept below them when anything non-zero was cut.
 *
 * @param coefficient Coefficient of the base.
 * @param exponent Exponent of the base.
 * @param power Exponent it is raised to, positive.
 * @returns The coefficient and exponent of the power, the last digit sticky.
 */
const guardedPower = (
	coefficient: bigint,
	exponent: number,
	power: bigint,
): { coefficient: bigint; exponent: number } => {
	const kept: number = PRECISION + GUARD_DIGITS;

	let inexact = false;

	const cut = (value: bigint, scale: number): [bigint, number] => {
		const excess: number = digitCount(value) - kept;

		if (excess <= 0) return [value, scale];

		const divisor: bigint = powerOfTen(excess);

		if (value % divisor !== 0n) inexact = true;

		return [value / divisor, scale + excess];
	};

	let result: [bigint, number] = [1n, 0];
	let factor: [bigint, number] = [coefficient, exponent];
	let remaining: bigint = power;

	while (remaining > 0n) {
		if (remaining % 2n === 1n) {
			result = cut(result[0] * factor[0], result[1] + factor[1]);
		}

		remaining /= 2n;

		if (remaining > 0n) {
			factor = cut(factor[0] * factor[0], factor[1] * 2);
		}
	}

	return inexact
		? { coefficient: result[0] * 10n + 1n, exponent: result[1] - 1 }
		: { coefficient: result[0], exponent: result[1] };
};

/**
 * Raises a value to an integer power, with the special cases of IEEE 754's
 * `pown`: anything to the power zero is one, `NaN` included; a zero or an
 * infinity to a negative power swaps with the other; and the sign is negative
 * only for a negative base and an odd power.
 *
 * The finite case is computed exactly and rounded once, so the result is the
 * correctly rounded one — up to {@link EXACT_DIGIT_LIMIT} digits of exact
 * power, past which it carries {@link GUARD_DIGITS} guard digits instead. A
 * result that plainly overflows or underflows is settled from its logarithm,
 * without building a number only to discard it.
 *
 * @param base Value raised.
 * @param power Integer exponent.
 * @param mode Rounding mode.
 * @returns The rounded power.
 */
export const powerParts = (
	base: DecimalParts,
	power: bigint,
	mode: RoundingMode,
): DecimalParts => {
	if (power === 0n) return ONE;
	if (base.kind === 'nan') return NOT_A_NUMBER;

	const negative: boolean = base.negative && power % 2n !== 0n;
	const positive: boolean = power > 0n;

	if (base.kind === 'infinity') {
		return positive ? infinity(negative) : zero(negative);
	}
	if (isZero(base)) return positive ? zero(negative) : infinity(negative);

	if (base.coefficient === 1n && base.exponent === 0) {
		return { ...ONE, negative };
	}

	const magnitude: bigint = power < 0n ? -power : power;
	const logarithm: number = decimalLogarithm(base) * Number(power);

	// Two whole powers of ten of margin either side: the double estimate is off
	// by far less, and anything inside the margin is computed.
	if (logarithm > MAXIMUM_ADJUSTED_EXPONENT + 2) {
		return finish(negative, 1n, MAXIMUM_ADJUSTED_EXPONENT + 1, mode);
	}

	if (logarithm < MINIMUM_EXPONENT - 2) {
		return finish(negative, 1n, MINIMUM_EXPONENT - 2, mode);
	}

	const exact: boolean =
		magnitude * BigInt(digitCount(base.coefficient)) <=
		BigInt(EXACT_DIGIT_LIMIT);

	const raised = exact
		? {
				coefficient: base.coefficient ** magnitude,
				exponent: base.exponent * Number(magnitude),
			}
		: guardedPower(base.coefficient, base.exponent, magnitude);

	if (positive) {
		return finish(negative, raised.coefficient, raised.exponent, mode);
	}

	return divideParts(
		ONE,
		{
			kind: 'finite',
			negative,
			coefficient: raised.coefficient,
			exponent: raised.exponent,
		},
		mode,
	);
};

/**
 * Rounds a value to a number of places after the point.
 *
 * @param parts Value to round.
 * @param places Places after the point; negative to round to tens, hundreds…
 * @param mode Rounding mode.
 * @returns The rounded value.
 */
export const roundParts = (
	parts: DecimalParts,
	places: number,
	mode: RoundingMode,
): DecimalParts => {
	if (parts.kind !== 'finite' || isZero(parts)) return parts;
	if (parts.exponent >= -places) return parts;

	const coefficient: bigint = discardDigits(
		parts.coefficient,
		-places - parts.exponent,
		mode,
		parts.negative,
	);

	return finish(parts.negative, coefficient, -places, mode);
};
