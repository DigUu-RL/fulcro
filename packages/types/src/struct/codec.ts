import { Decimal } from '@/decimal';
import { formatDecimal } from '@/decimal/format';
import { parseDecimal } from '@/decimal/parse';
import { type DecimalParts, powerOfTen } from '@/decimal/parts';
import { DoublePrecisionFloat } from '@/doublePrecisionFloat';
import { HalfPrecisionFloat } from '@/halfPrecisionFloat';
import type { IntegerType, IntegerWidth } from '@/integer';
import { SignedInteger } from '@/signedInteger';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { UnsignedInteger } from '@/unsignedInteger';

/**
 * How a field of a struct is laid out in bytes, and how it is compared.
 *
 * Internal. A struct is built from descriptors, and a descriptor says how a
 * value is checked but not how it is stored — `SinglePrecisionFloat` has no
 * byte order. The codec is what a struct looks up for each field, by the
 * identity of its descriptor, so the numeric types did not have to grow a
 * public byte encoding for this.
 *
 * Every multi-byte value is little-endian, whatever the platform: bytes a
 * struct writes on one machine read back the same on any other, and it is the
 * order of every platform a JavaScript engine runs on in practice.
 */
export interface FieldCodec {
	/** Size, in bytes. */
	readonly size: number;

	/** Alignment, in bytes. */
	readonly alignment: number;

	/**
	 * Reads a value.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts.
	 * @returns The value.
	 */
	read(view: DataView, offset: number): unknown;

	/**
	 * Writes a value.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts.
	 * @param value The value, already of the field's type.
	 */
	write(view: DataView, offset: number, value: unknown): void;

	/**
	 * Compares two values as the field's own type does.
	 *
	 * @param left First value.
	 * @param right Second value.
	 * @returns `true` when they are equal.
	 */
	equals(left: unknown, right: unknown): boolean;
}

/** Bits of a 64-bit half of a 128-bit value. */
const HALF_WIDTH = 64n;

/**
 * The codec of a 128-bit integer, as two 64-bit halves, low half first.
 *
 * @param descriptor Descriptor of the width.
 * @returns The codec.
 */
const integer128Codec = (descriptor: IntegerType<unknown>): FieldCodec => ({
	size: 16,
	alignment: 16,
	read: (view, offset) => {
		const low: bigint = view.getBigUint64(offset, true);
		const high: bigint = descriptor.signed
			? view.getBigInt64(offset + 8, true)
			: view.getBigUint64(offset + 8, true);

		return (high << HALF_WIDTH) | low;
	},
	write: (view, offset, value) => {
		view.setBigUint64(offset, BigInt.asUintN(64, value as bigint), true);
		view.setBigUint64(
			offset + 8,
			BigInt.asUintN(64, (value as bigint) >> HALF_WIDTH),
			true,
		);
	},
	equals: (left, right) => descriptor.equals(left, right),
});

/**
 * The codec of a fixed-width integer, through the `DataView` accessor of its
 * width, or two of them at 128 bits.
 *
 * @param descriptor Descriptor of the width.
 * @returns The codec.
 */
const integerCodec = (descriptor: IntegerType<unknown>): FieldCodec => {
	const { signed, width } = descriptor;

	if (width === 128) return integer128Codec(descriptor);

	const size: number = width / 8;
	const equals = (left: unknown, right: unknown): boolean =>
		descriptor.equals(left, right);

	switch (width) {
		case 8:
			return {
				size,
				alignment: size,
				read: (view, offset) =>
					signed ? view.getInt8(offset) : view.getUint8(offset),
				write: (view, offset, value) =>
					signed
						? view.setInt8(offset, value as number)
						: view.setUint8(offset, value as number),
				equals,
			};
		case 16:
			return {
				size,
				alignment: size,
				read: (view, offset) =>
					signed ? view.getInt16(offset, true) : view.getUint16(offset, true),
				write: (view, offset, value) =>
					signed
						? view.setInt16(offset, value as number, true)
						: view.setUint16(offset, value as number, true),
				equals,
			};
		case 32:
			return {
				size,
				alignment: size,
				read: (view, offset) =>
					signed ? view.getInt32(offset, true) : view.getUint32(offset, true),
				write: (view, offset, value) =>
					signed
						? view.setInt32(offset, value as number, true)
						: view.setUint32(offset, value as number, true),
				equals,
			};
		default:
			return {
				size,
				alignment: size,
				read: (view, offset) =>
					signed
						? view.getBigInt64(offset, true)
						: view.getBigUint64(offset, true),
				write: (view, offset, value) =>
					signed
						? view.setBigInt64(offset, value as bigint, true)
						: view.setBigUint64(offset, value as bigint, true),
				equals,
			};
	}
};

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

	// `Math.log2` is not exact next to a power of two, so the estimate is
	// corrected against the power itself.
	let exponent: number = Math.floor(Math.log2(magnitude));

	if (2 ** exponent > magnitude) exponent--;
	else if (2 ** (exponent + 1) <= magnitude) exponent++;

	return (
		sign | ((exponent + 15) << 10) | ((magnitude / 2 ** exponent - 1) * 1024)
	);
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

/** The codecs of the three binary float formats, by descriptor. */
const floatCodecs = new Map<object, FieldCodec>([
	[
		HalfPrecisionFloat,
		{
			size: 2,
			alignment: 2,
			read: (view, offset) => decodeHalf(view.getUint16(offset, true)),
			write: (view, offset, value) =>
				view.setUint16(offset, encodeHalf(value as number), true),
			equals: (left, right) =>
				HalfPrecisionFloat.equals(
					left as HalfPrecisionFloat,
					right as HalfPrecisionFloat,
				),
		},
	],
	[
		SinglePrecisionFloat,
		{
			size: 4,
			alignment: 4,
			read: (view, offset) => view.getFloat32(offset, true),
			write: (view, offset, value) =>
				view.setFloat32(offset, value as number, true),
			equals: (left, right) =>
				SinglePrecisionFloat.equals(
					left as SinglePrecisionFloat,
					right as SinglePrecisionFloat,
				),
		},
	],
	[
		DoublePrecisionFloat,
		{
			size: 8,
			alignment: 8,
			read: (view, offset) => view.getFloat64(offset, true),
			write: (view, offset, value) =>
				view.setFloat64(offset, value as number, true),
			equals: (left, right) =>
				DoublePrecisionFloat.equals(
					left as DoublePrecisionFloat,
					right as DoublePrecisionFloat,
				),
		},
	],
]);

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
const encodeDecimal = (parts: DecimalParts): bigint => {
	const sign: bigint = parts.negative ? 1n << 127n : 0n;

	if (parts.kind === 'nan') return 0x7c00_0000_0000_0000n << HALF_WIDTH;
	if (parts.kind === 'infinity') {
		return sign | (0x7800_0000_0000_0000n << HALF_WIDTH);
	}

	let { coefficient, exponent } = parts;

	if (exponent > DECIMAL_MAXIMUM_EXPONENT) {
		coefficient *= powerOfTen(exponent - DECIMAL_MAXIMUM_EXPONENT);
		exponent = DECIMAL_MAXIMUM_EXPONENT;
	}

	return (
		sign |
		(BigInt(exponent + DECIMAL_EXPONENT_BIAS) << DECIMAL_COEFFICIENT_BITS) |
		coefficient
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
const decodeDecimal = (bits: bigint): DecimalParts => {
	const negative: boolean = bits >> 127n === 1n;
	const combination: bigint = (bits >> 122n) & 0x1fn;

	if (combination === 0x1fn) {
		return { kind: 'nan', negative: false, coefficient: 0n, exponent: 0 };
	}

	if (combination === 0x1en) {
		return { kind: 'infinity', negative, coefficient: 0n, exponent: 0 };
	}

	let coefficient: bigint =
		((bits >> 125n) & 0x3n) === 0x3n
			? 0n
			: bits & ((1n << DECIMAL_COEFFICIENT_BITS) - 1n);

	if (coefficient >= DECIMAL_COEFFICIENT_LIMIT) coefficient = 0n;
	if (coefficient === 0n) {
		return { kind: 'finite', negative, coefficient: 0n, exponent: 0 };
	}

	let exponent: number =
		Number((bits >> DECIMAL_COEFFICIENT_BITS) & 0x3fffn) -
		DECIMAL_EXPONENT_BIAS;

	while (coefficient % 10n === 0n) {
		coefficient /= 10n;
		exponent++;
	}

	return { kind: 'finite', negative, coefficient, exponent };
};

/**
 * The codec of `Decimal`, as decimal128.
 *
 * Its parts are private to the class, so they travel through its text, which
 * reads back exactly: the shortest text of a normalised value names exactly
 * that value.
 */
const decimalCodec: FieldCodec = {
	size: 16,
	alignment: 16,
	read: (view, offset) => {
		const bits: bigint =
			(view.getBigUint64(offset + 8, true) << HALF_WIDTH) |
			view.getBigUint64(offset, true);

		return Decimal.from(formatDecimal(decodeDecimal(bits)));
	},
	write: (view, offset, value) => {
		const bits: bigint = encodeDecimal(parseDecimal(String(value)));

		view.setBigUint64(offset, BigInt.asUintN(64, bits), true);
		view.setBigUint64(offset + 8, bits >> HALF_WIDTH, true);
	},
	equals: (left, right) => (left as Decimal).equals(right as Decimal),
};

/** Codecs registered by the structs themselves, so one can nest in another. */
const structCodecs = new WeakMap<object, FieldCodec>();

/** Widths a fixed-width integer comes in. */
const INTEGER_WIDTHS: readonly unknown[] = [8, 16, 32, 64, 128];

/**
 * Tells whether a value is the descriptor `SignedInteger` or `UnsignedInteger`
 * returns for its width — the same object, not one shaped like it.
 *
 * @param descriptor Value to inspect.
 * @returns `true` for an integer descriptor of this package.
 */
const isIntegerDescriptor = (
	descriptor: object,
): descriptor is IntegerType<unknown> => {
	const { signed, width } = descriptor as Partial<IntegerType<unknown>>;

	if (typeof signed !== 'boolean' || !INTEGER_WIDTHS.includes(width)) {
		return false;
	}

	const factory = signed ? SignedInteger : UnsignedInteger;

	return factory(width as IntegerWidth) === descriptor;
};

/**
 * Registers the codec of a struct, so that another struct can hold it as a
 * field.
 *
 * @param descriptor Descriptor of the struct.
 * @param codec How it is stored.
 */
export const registerStructCodec = (
	descriptor: object,
	codec: FieldCodec,
): void => {
	structCodecs.set(descriptor, codec);
};

/**
 * The codec of a field's descriptor.
 *
 * @param descriptor What the field was declared with.
 * @returns Its codec, or `undefined` for a descriptor with no fixed layout.
 */
export const codecOf = (descriptor: unknown): FieldCodec | undefined => {
	if (typeof descriptor !== 'object' && typeof descriptor !== 'function') {
		return undefined;
	}

	if (descriptor === null) return undefined;
	if (descriptor === Decimal) return decimalCodec;

	const known: FieldCodec | undefined =
		floatCodecs.get(descriptor) ?? structCodecs.get(descriptor);

	if (known !== undefined) return known;

	return isIntegerDescriptor(descriptor) ? integerCodec(descriptor) : undefined;
};
