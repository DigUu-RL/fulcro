import type { RoundingMode } from '@/roundingMode';

import {
	type DecimalParts,
	digitCount,
	infinity,
	MAXIMUM_ADJUSTED_EXPONENT,
	MINIMUM_EXPONENT,
	powerOfTen,
	PRECISION,
	zero,
} from './parts';

/**
 * Where the discarded digits of a rounding sat relative to half a unit of the
 * last digit kept. That, and the sign, is everything any rounding mode needs.
 */
type Discarded = 'nothing' | 'belowHalf' | 'half' | 'aboveHalf';

/**
 * Settles a truncated quotient according to a mode.
 *
 * @param quotient Magnitude with the discarded digits removed.
 * @param discarded What those digits amounted to.
 * @param mode Rounding mode.
 * @param negative Sign of the value, which the directed modes depend on.
 * @returns The rounded magnitude.
 */
const settle = (
	quotient: bigint,
	discarded: Discarded,
	mode: RoundingMode,
	negative: boolean,
): bigint => {
	if (discarded === 'nothing') return quotient;

	switch (mode) {
		case 'truncate':
			return quotient;
		case 'floor':
			return negative ? quotient + 1n : quotient;
		case 'ceiling':
			return negative ? quotient : quotient + 1n;
		case 'halfAwayFromZero':
			return discarded === 'belowHalf' ? quotient : quotient + 1n;
		case 'halfEven':
			if (discarded === 'belowHalf') return quotient;
			if (discarded === 'aboveHalf') return quotient + 1n;

			return quotient % 2n === 0n ? quotient : quotient + 1n;
	}
};

/**
 * Divides a magnitude by 10^digits, rounding the quotient by a mode.
 *
 * The number of digits may be far larger than the magnitude has — rounding
 * 1 × 10^-6000 to two places drops six thousand of them — so that case is
 * answered without ever building the power: every digit is discarded, and
 * together they are below a tenth of a unit.
 *
 * @param magnitude Non-negative integer to shorten.
 * @param digits How many trailing digits to discard, at least one.
 * @param mode Rounding mode.
 * @param negative Sign of the value.
 * @returns The rounded quotient.
 */
export const discardDigits = (
	magnitude: bigint,
	digits: number,
	mode: RoundingMode,
	negative: boolean,
): bigint => {
	if (digits > digitCount(magnitude)) {
		return settle(
			0n,
			magnitude === 0n ? 'nothing' : 'belowHalf',
			mode,
			negative,
		);
	}

	const divisor: bigint = powerOfTen(digits);
	const quotient: bigint = magnitude / divisor;
	const remainder: bigint = magnitude % divisor;
	const half: bigint = divisor / 2n;

	const discarded: Discarded =
		remainder === 0n
			? 'nothing'
			: remainder < half
				? 'belowHalf'
				: remainder === half
					? 'half'
					: 'aboveHalf';

	return settle(quotient, discarded, mode, negative);
};

/**
 * The result of an overflow, which IEEE 754 makes depend on the mode: the
 * modes that round to nearest go to infinity, and a directed mode goes to
 * infinity only in its own direction, stopping at the largest finite value in
 * the other.
 *
 * @param negative Sign of the value that overflowed.
 * @param mode Rounding mode.
 * @returns The parts of the result.
 */
const overflow = (negative: boolean, mode: RoundingMode): DecimalParts => {
	const toInfinity: boolean =
		mode === 'halfEven' ||
		mode === 'halfAwayFromZero' ||
		(mode === 'ceiling' && !negative) ||
		(mode === 'floor' && negative);

	if (toInfinity) return infinity(negative);

	// 9.999…9 × 10^6144: thirty-four nines, with the last one at 10^6111.
	return {
		kind: 'finite',
		negative,
		coefficient: powerOfTen(PRECISION) - 1n,
		exponent: MAXIMUM_ADJUSTED_EXPONENT - PRECISION + 1,
	};
};

/**
 * Turns an exact result into a decimal128 value: rounded to thirty-four
 * digits, rounded again if it is finer than the smallest subnormal, stripped
 * of trailing zeros, and sent to infinity if it no longer fits.
 *
 * Every operation ends here, which is what keeps every result inside the format
 * whatever the operation computed on the way.
 *
 * @param negative Sign of the result.
 * @param magnitude Exact magnitude, as an integer.
 * @param exponent Power of ten the magnitude is scaled by.
 * @param mode Rounding mode.
 * @returns The parts of the result.
 */
export const finish = (
	negative: boolean,
	magnitude: bigint,
	exponent: number,
	mode: RoundingMode,
): DecimalParts => {
	if (magnitude === 0n) return zero(negative);

	let coefficient: bigint = magnitude;
	let scale: number = exponent;

	const excess: number = Math.max(
		digitCount(coefficient) - PRECISION,
		MINIMUM_EXPONENT - scale,
	);

	if (excess > 0) {
		coefficient = discardDigits(coefficient, excess, mode, negative);
		scale += excess;

		// Rounded away entirely: an underflow keeps its sign.
		if (coefficient === 0n) return zero(negative);

		// 99…9 rounded up to 10^34 has one digit too many, and it is a zero.
		if (coefficient === powerOfTen(PRECISION)) {
			coefficient /= 10n;
			scale += 1;
		}
	}

	while (coefficient % 10n === 0n) {
		coefficient /= 10n;
		scale += 1;
	}

	if (scale + digitCount(coefficient) - 1 > MAXIMUM_ADJUSTED_EXPONENT) {
		return overflow(negative, mode);
	}

	return { kind: 'finite', negative, coefficient, exponent: scale };
};
