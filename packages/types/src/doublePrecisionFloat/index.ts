import type { Branded } from '@/brand';
import { createFloatType } from '@/float';
import type { Layout } from '@/layout';
import type { BoundedNumericType } from '@/numericType';

/**
 * An IEEE 754 binary64 value: 53 bits of precision, 11 of exponent.
 *
 * Every JavaScript `number` already is one, so conversion never rounds. The type
 * exists so that a double is named as a choice rather than left as the default
 * nobody chose, and so that it carries a layout like the other formats.
 */
export type DoublePrecisionFloat = Branded<number, 'DoublePrecisionFloat'> &
	Layout<8, 8>;

/**
 * The descriptor of {@link DoublePrecisionFloat}.
 *
 * ```ts
 * DoublePrecisionFloat.from(0.1); // 0.1
 * ```
 */
export const DoublePrecisionFloat: BoundedNumericType<
	DoublePrecisionFloat,
	number
> = createFloatType('DoublePrecisionFloat', Number.MAX_VALUE, (value) => value);
