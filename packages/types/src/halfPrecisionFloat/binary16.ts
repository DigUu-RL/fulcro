import type { ByteCodec } from '@/src/fixedLayout';
import { binaryExponentOf } from '@/src/float/binaryExponent';

/** Exponent of the smallest normal half precision value. */
const HALF_MINIMUM_NORMAL_EXPONENT = -14;

/** Spacing of the half precision subnormals, 2^-24. */
const HALF_SUBNORMAL_SPACING = 2 ** -24;

/**
 * The binary16 bit pattern of a half precision value.
 *
 * Written here rather than delegated to `DataView.prototype.setFloat16`, which
 * Node 22 — the oldest line this package supports — does not have. The value
 * is already exactly representable, so every division below is exact and
 * nothing is rounded: this only rearranges bits.
 *
 * @param value A half precision value.
 * @returns Its sixteen bits.
 */
const encodeHalf = (value: number): number => {
	if (Number.isNaN(value)) return 0x7e00;

	const sign: number = value < 0 || Object.is(value, -0) ? 0x8000 : 0;
	const magnitude: number = Math.abs(value);

	if (magnitude === Infinity) return sign | 0x7c00;

	if (magnitude < 2 ** HALF_MINIMUM_NORMAL_EXPONENT) {
		return sign | (magnitude / HALF_SUBNORMAL_SPACING);
	}

	const exponent: number = binaryExponentOf(magnitude);

	return sign | ((exponent + 15) << 10) | ((magnitude / 2 ** exponent - 1) * 1024);
};

/**
 * The half precision value of a binary16 bit pattern.
 *
 * @param bits Sixteen bits.
 * @returns The value they encode.
 */
const decodeHalf = (bits: number): number => {
	const sign: number = bits & 0x8000 ? -1 : 1;
	const exponent: number = (bits >> 10) & 0x1f;
	const fraction: number = bits & 0x3ff;

	if (exponent === 0) return sign * fraction * HALF_SUBNORMAL_SPACING;
	if (exponent === 0x1f) return fraction === 0 ? sign * Infinity : NaN;

	return sign * (1 + fraction / 1024) * 2 ** (exponent - 15);
};

/** How a half precision value is stored: two bytes of binary16, little-endian. */
export const binary16Codec: ByteCodec<number> = {
	size: 2,
	alignment: 2,
	read: (view, offset) => decodeHalf(view.getUint16(offset, true)),
	write: (view, offset, value) => {
		view.setUint16(offset, encodeHalf(value), true);
	},
};
