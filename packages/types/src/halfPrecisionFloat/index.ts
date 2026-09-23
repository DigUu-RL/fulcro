import type { Branded } from '@/brand';
import { createFloatType } from '@/float';
import type { Layout } from '@/layout';
import type { BoundedNumericType } from '@/numericType';

/**
 * An IEEE 754 binary16 value: 11 bits of precision, 5 of exponent, finite from
 * -65504 to 65504.
 *
 * Carried by a `number` holding a value the format can represent exactly.
 * Converting rounds to the nearest such value, ties to even.
 */
export type HalfPrecisionFloat = Branded<number, 'HalfPrecisionFloat'> &
	Layout<2, 2>;

/**
 * The point from which a double rounds to infinity rather than to 65504, the
 * largest finite value: halfway to 65536, which is where the next value would be if
 * the exponent had room. Exactly halfway is a tie, and it goes to 65536 —
 * whose significand is even — and therefore to infinity.
 */
const OVERFLOW_THRESHOLD = 65520;

/** Exponent of the smallest normal half precision value, 2^-14. */
const MINIMUM_NORMAL_EXPONENT = -14;

/** Bits of the significand after the leading one. */
const FRACTION_BITS = 10;

/**
 * Rounds a double to the nearest half precision value, ties to even.
 *
 * Written here rather than delegated to `Math.f16round`, which Node 22 — the
 * oldest line this package supports — does not have. The method is the one the
 * format implies: find the spacing of half precision values around the input,
 * which is a power of two, express the input in units of it, and round that to
 * an integer. Dividing by a power of two is exact in a double, so the only
 * rounding is the one being performed.
 *
 * @param value Double to round.
 * @returns The nearest half precision value, as a double.
 */
const roundToHalfPrecision = (value: number): number => {
	// NaN, both infinities and both zeros are their own half precision value.
	if (!Number.isFinite(value) || value === 0) return value;

	const magnitude: number = Math.abs(value);
	const sign: number = value < 0 ? -1 : 1;

	if (magnitude >= OVERFLOW_THRESHOLD) return sign * Infinity;

	// `Math.log2` is not exact next to a power of two, so the estimate is
	// corrected against the power itself.
	let exponent: number = Math.floor(Math.log2(magnitude));

	if (2 ** exponent > magnitude) exponent--;
	else if (2 ** (exponent + 1) <= magnitude) exponent++;

	// Below the normal range the spacing stops shrinking: that is what makes
	// the subnormals evenly spaced at 2^-24.
	const spacing: number =
		2 ** (Math.max(exponent, MINIMUM_NORMAL_EXPONENT) - FRACTION_BITS);
	const units: number = magnitude / spacing;

	// `Math.round` breaks a tie upwards; a tie on an odd count goes back down,
	// which is what makes it ties to even.
	let rounded: number = Math.round(units);

	if (rounded - units === 0.5 && rounded % 2 !== 0) rounded--;

	return sign * rounded * spacing;
};

/**
 * The descriptor of {@link HalfPrecisionFloat}.
 *
 * ```ts
 * HalfPrecisionFloat.from(0.1); // 0.0999755859375
 * HalfPrecisionFloat.from(65520); // Infinity
 * ```
 */
export const HalfPrecisionFloat: BoundedNumericType<
	HalfPrecisionFloat,
	number
> = createFloatType('HalfPrecisionFloat', 65504, roundToHalfPrecision);
