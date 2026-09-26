import { createError } from '@fulcro/errors';

import type { RoundingMode } from '@/roundingMode';

import {
	adjustedExponent,
	type DecimalParts,
	digitCount,
	isZero,
	powerOfTen,
} from './parts';
import { discardDigits } from './round';

/**
 * The textual forms of a decimal, each following the method of `Number` it is
 * named after — the same switch points between plain and exponential notation,
 * the same argument ranges — so a reader who knows one knows the other.
 */

/** Largest digit count `toFixed`, `toPrecision` and `toExponential` accept. */
const MAXIMUM_DIGITS = 100;

/**
 * Refuses a digit count outside what the `Number` methods accept.
 *
 * @param operation Method being called.
 * @param digits Count it was handed.
 * @param minimum Smallest count accepted.
 * @returns The count.
 * @throws {RangeError} When the count is not an integer in range.
 */
export const requireDigits = (
	operation: string,
	digits: number,
	minimum: number,
): number => {
	if (
		!Number.isInteger(digits) ||
		digits < minimum ||
		digits > MAXIMUM_DIGITS
	) {
		throw createError(
			'FULCRO6022',
			`Decimal.${operation}`,
			minimum,
			MAXIMUM_DIGITS,
			digits,
		);
	}

	return digits;
};

/**
 * The text of a value that is not finite, or `null` for one that is.
 *
 * @param parts Parts to print.
 * @returns `'NaN'`, `'Infinity'`, `'-Infinity'` or `null`.
 */
const specialText = (parts: DecimalParts): string | null => {
	if (parts.kind === 'nan') return 'NaN';
	if (parts.kind === 'infinity') {
		return parts.negative ? '-Infinity' : 'Infinity';
	}

	return null;
};

/**
 * Places a decimal point in a string of digits.
 *
 * @param digits Digits of the value.
 * @param exponent Power of ten the digits are scaled by.
 * @returns The value in plain notation.
 */
const placePoint = (digits: string, exponent: number): string => {
	if (exponent >= 0) return digits + '0'.repeat(exponent);

	const point: number = digits.length + exponent;

	return point > 0
		? `${digits.slice(0, point)}.${digits.slice(point)}`
		: `0.${'0'.repeat(-point)}${digits}`;
};

/**
 * Writes digits in exponential notation, as `Number` does: `1.25e+3`.
 *
 * @param digits Digits of the value, the first one non-zero unless all are.
 * @param adjusted Exponent of the leading digit.
 * @returns The value in exponential notation.
 */
const exponential = (digits: string, adjusted: number): string =>
	`${digits[0]}${digits.length > 1 ? `.${digits.slice(1)}` : ''}e${adjusted < 0 ? '-' : '+'}${Math.abs(adjusted)}`;

/**
 * The shortest text that reads back as the same value.
 *
 * Plain notation from 10^-6 up to 10^21 and exponential outside it, the points
 * where `Number.prototype.toString` switches. A zero keeps its sign, so `-0`
 * prints as `-0` — a decimal can round to it, and it would otherwise print as a
 * value it is not.
 *
 * @param parts Parts to print.
 * @returns The text.
 */
export const formatDecimal = (parts: DecimalParts): string => {
	const special: string | null = specialText(parts);

	if (special !== null) return special;

	const sign: string = parts.negative ? '-' : '';

	if (isZero(parts)) return `${sign}0`;

	const digits: string = parts.coefficient.toString();
	const adjusted: number = adjustedExponent(parts);

	return adjusted >= 21 || adjusted < -6
		? sign + exponential(digits, adjusted)
		: sign + placePoint(digits, parts.exponent);
};

/**
 * The value with a fixed number of digits after the point, in plain notation
 * whatever its magnitude.
 *
 * @param parts Parts to print.
 * @param fractionDigits Digits after the point.
 * @param mode Rounding mode.
 * @returns The text.
 */
export const formatFixed = (
	parts: DecimalParts,
	fractionDigits: number,
	mode: RoundingMode,
): string => {
	const special: string | null = specialText(parts);

	if (special !== null) return special;

	const { negative, coefficient, exponent } = parts;

	// The digits scaled so that the last one is the last one printed.
	const scaled: bigint =
		exponent + fractionDigits >= 0
			? coefficient * powerOfTen(exponent + fractionDigits)
			: discardDigits(
					coefficient,
					-(exponent + fractionDigits),
					mode,
					negative,
				);

	const digits: string = scaled.toString().padStart(fractionDigits + 1, '0');
	const point: number = digits.length - fractionDigits;
	const text: string =
		fractionDigits === 0
			? digits
			: `${digits.slice(0, point)}.${digits.slice(point)}`;

	// A negative value that rounded to zero still prints its sign, as
	// `(-0.001).toFixed(2)` does; `-0` itself does not, as `(-0).toFixed(2)`
	// does not.
	return negative && !isZero(parts) ? `-${text}` : text;
};

/**
 * The digits of a value rounded to a number of significant digits, padded with
 * zeros when it has fewer.
 *
 * @param parts Finite, non-zero parts.
 * @param precision Significant digits wanted.
 * @param mode Rounding mode.
 * @returns The digits, and the exponent of the leading one.
 */
const significantDigits = (
	parts: DecimalParts,
	precision: number,
	mode: RoundingMode,
): { readonly digits: string; readonly adjusted: number } => {
	const { negative, coefficient, exponent } = parts;
	const excess: number = digitCount(coefficient) - precision;

	if (excess <= 0) {
		return {
			digits: coefficient.toString() + '0'.repeat(-excess),
			adjusted: adjustedExponent(parts),
		};
	}

	let rounded: bigint = discardDigits(coefficient, excess, mode, negative);
	let scale: number = exponent + excess;

	// 9.99 to two digits is 10, which is one digit too many and a power of ten.
	if (rounded === powerOfTen(precision)) {
		rounded /= 10n;
		scale += 1;
	}

	return { digits: rounded.toString(), adjusted: scale + precision - 1 };
};

/**
 * The value with a number of significant digits, in plain notation unless the
 * exponent is below -6 or at least the precision — the rule of
 * `Number.prototype.toPrecision`.
 *
 * @param parts Parts to print.
 * @param precision Significant digits.
 * @param mode Rounding mode.
 * @returns The text.
 */
export const formatPrecision = (
	parts: DecimalParts,
	precision: number,
	mode: RoundingMode,
): string => {
	const special: string | null = specialText(parts);

	if (special !== null) return special;

	const sign: string = parts.negative && !isZero(parts) ? '-' : '';

	if (isZero(parts)) return placePoint('0'.repeat(precision), 1 - precision);

	const { digits, adjusted } = significantDigits(parts, precision, mode);

	return adjusted < -6 || adjusted >= precision
		? sign + exponential(digits, adjusted)
		: sign + placePoint(digits, adjusted - precision + 1);
};

/**
 * The value in exponential notation, with a number of digits after the point,
 * or with as many as it takes when none is given.
 *
 * @param parts Parts to print.
 * @param fractionDigits Digits after the point, or `undefined` for all of them.
 * @param mode Rounding mode.
 * @returns The text.
 */
export const formatExponential = (
	parts: DecimalParts,
	fractionDigits: number | undefined,
	mode: RoundingMode,
): string => {
	const special: string | null = specialText(parts);

	if (special !== null) return special;

	const sign: string = parts.negative && !isZero(parts) ? '-' : '';

	if (isZero(parts)) {
		return exponential('0'.repeat((fractionDigits ?? 0) + 1), 0);
	}

	const precision: number =
		fractionDigits === undefined
			? digitCount(parts.coefficient)
			: fractionDigits + 1;

	const { digits, adjusted } = significantDigits(parts, precision, mode);

	return sign + exponential(digits, adjusted);
};
