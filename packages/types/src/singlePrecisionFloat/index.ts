import type { Branded } from '@/src/brand';
import { createFloatType, type FloatType } from '@/src/float';
import type { Layout } from '@/src/layout';

/**
 * An IEEE 754 binary32 value: 24 bits of precision, 8 of exponent.
 *
 * Carried by a `number` holding a value the format can represent exactly, so it
 * reads, compares and prints like any other number. Converting rounds to the
 * nearest such value, ties to even, as `Math.fround` does.
 */
export type SinglePrecisionFloat = Branded<number, 'SinglePrecisionFloat'> & Layout<4, 4>;

/**
 * The descriptor of {@link SinglePrecisionFloat}.
 *
 * ```ts
 * SinglePrecisionFloat.from(0.1); // 0.10000000149011612
 * SinglePrecisionFloat.from(1e39); // Infinity
 * ```
 *
 * Stored as four bytes, aligned on four, little-endian.
 */
export const SinglePrecisionFloat: FloatType<SinglePrecisionFloat> = createFloatType(
	'SinglePrecisionFloat',
	// (2 - 2^-23) × 2^127
	3.4028234663852886e38,
	Math.fround,
	{
		size: 4,
		alignment: 4,
		read: (view, offset) => view.getFloat32(offset, true),
		write: (view, offset, value) => {
			view.setFloat32(offset, value, true);
		},
	},
	'Float32',
);
