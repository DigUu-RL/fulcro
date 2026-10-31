import { type DecimalParts, powerOfTen } from '@/src/decimal/parts';

/** Bias of the decimal128 exponent: the stored field is `exponent + 6176`. */
const DECIMAL_EXPONENT_BIAS = 6176;

/**
 * Largest exponent a decimal128 coefficient can be scaled by: the largest
 * value, thirty-four nines, has its last digit at 10^6111.
 */
const DECIMAL_MAXIMUM_EXPONENT = 6111;

/** Bits of the decimal128 coefficient field. */
const DECIMAL_COEFFICIENT_BITS = 113n;

/** The coefficients a decimal128 holds are below this; above it is non-canonical. */
const DECIMAL_COEFFICIENT_LIMIT: bigint = powerOfTen(34);

/**
 * The decimal128 bits of a decimal, in the binary integer decimal encoding
 * IEEE 754-2008 defines: a sign bit, fourteen bits of biased exponent and a
 * 113-bit binary coefficient.
 *
 * The parts are normalised, which can leave a large value with a short
 * coefficient and an exponent past the one the format stores — 1 × 10^6144.
 * Those are scaled back into range by moving digits into the coefficient,
 * which always has room for them because the value is within range.
 *
 * @param parts The value.
 * @returns Its 128 bits.
 */
export const encodeDecimal = (parts: DecimalParts): bigint => {
	const sign: bigint = parts.negative ? 1n << 127n : 0n;

	if (parts.kind === 'nan') return 0x7c00_0000_0000_0000n << 64n;

	if (parts.kind === 'infinity') {
		return sign | (0x7800_0000_0000_0000n << 64n);
	}

	let { coefficient, exponent } = parts;

	if (exponent > DECIMAL_MAXIMUM_EXPONENT) {
		coefficient *= powerOfTen(exponent - DECIMAL_MAXIMUM_EXPONENT);
		exponent = DECIMAL_MAXIMUM_EXPONENT;
	}

	return (
		sign | (BigInt(exponent + DECIMAL_EXPONENT_BIAS) << DECIMAL_COEFFICIENT_BITS) | coefficient
	);
};

/**
 * The decimal of decimal128 bits.
 *
 * A coefficient past thirty-four digits — including every one written in the
 * encoding's second form, whose leading bits are `11` — is non-canonical, and
 * IEEE 754 reads it as zero. Trailing zeros are moved into the exponent, which
 * is the normalised form every `Decimal` holds.
 *
 * @param bits 128 bits.
 * @returns The parts they encode.
 */
export const decodeDecimal = (bits: bigint): DecimalParts => {
	const negative: boolean = bits >> 127n === 1n;
	const combination: bigint = (bits >> 122n) & 0x1fn;

	if (combination === 0x1fn) {
		return { kind: 'nan', negative: false, coefficient: 0n, exponent: 0 };
	}

	if (combination === 0x1en) {
		return { kind: 'infinity', negative, coefficient: 0n, exponent: 0 };
	}

	let coefficient: bigint =
		((bits >> 125n) & 0x3n) === 0x3n ? 0n : bits & ((1n << DECIMAL_COEFFICIENT_BITS) - 1n);

	if (coefficient >= DECIMAL_COEFFICIENT_LIMIT) coefficient = 0n;

	if (coefficient === 0n) {
		return { kind: 'finite', negative, coefficient: 0n, exponent: 0 };
	}

	let exponent: number =
		Number((bits >> DECIMAL_COEFFICIENT_BITS) & 0x3fffn) - DECIMAL_EXPONENT_BIAS;

	while (coefficient % 10n === 0n) {
		coefficient /= 10n;
		exponent++;
	}

	return { kind: 'finite', negative, coefficient, exponent };
};
