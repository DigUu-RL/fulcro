import type { Branded } from '@/src/brand';
import { createFloatType, type FloatType } from '@/src/float';
import type { Layout } from '@/src/layout';

/**
 * An IEEE 754 binary64 value: 53 bits of precision, 11 of exponent.
 *
 * Every JavaScript `number` already is one, so conversion never rounds. The type
 * exists so that a double is named as a choice rather than left as the default
 * nobody chose, and so that it carries a layout like the other formats.
 */
export type DoublePrecisionFloat = Branded<number, 'DoublePrecisionFloat'> & Layout<8, 8>;

/**
 * The descriptor of {@link DoublePrecisionFloat}.
 *
 * ```ts
 * DoublePrecisionFloat.from(0.1); // 0.1
 * ```
 *
 * Stored as eight bytes, aligned on eight, little-endian.
 */
export const DoublePrecisionFloat: FloatType<DoublePrecisionFloat> = createFloatType(
	'DoublePrecisionFloat',
	Number.MAX_VALUE,
	(value) => value,
	{
		size: 8,
		alignment: 8,
		read: (view, offset) => view.getFloat64(offset, true),
		write: (view, offset, value) => {
			view.setFloat64(offset, value, true);
		},
	},
	'Float64',
);
