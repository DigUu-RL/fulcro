import type { Branded } from '@/brand';
import { createFloatType } from '@/float';
import type { Layout } from '@/layout';
import type { NumericType } from '@/numericType';

/**
 * An IEEE 754 binary32 value: 24 bits of precision, 8 of exponent.
 *
 * Carried by a `number` holding a value the format can represent exactly, so it
 * reads, compares and prints like any other number. Converting rounds to the
 * nearest such value, ties to even, as `Math.fround` does.
 */
export type SinglePrecisionFloat = Branded<number, 'SinglePrecisionFloat'> &
	Layout<4, 4>;

/**
 * The descriptor of {@link SinglePrecisionFloat}.
 *
 * ```ts
 * SinglePrecisionFloat.from(0.1); // 0.10000000149011612
 * SinglePrecisionFloat.from(1e39); // Infinity
 * ```
 */
export const SinglePrecisionFloat: NumericType<SinglePrecisionFloat, number> =
	createFloatType('SinglePrecisionFloat', Math.fround);
