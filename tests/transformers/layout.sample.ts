import { alignOf, sizeOf } from '@fulcro/reflect';
import type {
	Decimal,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	UnsignedInteger,
} from '@fulcro/types';

/**
 * Fixture for the layout suite: every numeric type of `@fulcro/types` measured
 * by `@fulcro/reflect`, both imported by name as a consumer imports them.
 *
 * The types are imported with `import type`, which is the point being made —
 * the layout travels in the declarations alone, and nothing of `@fulcro/types`
 * has to be loaded for `sizeOf` to answer.
 */

export const signed8 = sizeOf<SignedInteger<8>>();
export const signed16 = sizeOf<SignedInteger<16>>();
export const signed32 = sizeOf<SignedInteger<32>>();
export const signed64 = sizeOf<SignedInteger<64>>();
export const signed128 = sizeOf<SignedInteger<128>>();
export const unsigned8 = sizeOf<UnsignedInteger<8>>();
export const unsigned128 = alignOf<UnsignedInteger<128>>();
export const half = sizeOf<HalfPrecisionFloat>();
export const single = sizeOf<SinglePrecisionFloat>();
export const double = alignOf<DoublePrecisionFloat>();
export const decimalSize = sizeOf<Decimal>();
export const decimalAlignment = alignOf<Decimal>();
