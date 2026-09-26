import type {
	DoublePrecisionFloat,
	IntegerType,
	SinglePrecisionFloat,
	Struct,
	StructType,
	UnsignedInteger,
} from '@fulcro/types';

/**
 * A struct as a built package ships it: a declaration, and no source.
 *
 * `struct('Shipped', { … })` compiles to exactly this line in a `.d.ts`. The
 * call and its object literal are gone; what is left is the type, and the order
 * the fields are written in inside it. That order is all `offsetOf` and
 * `layoutOf` have to place the fields by — which is why this file exists.
 */
export declare const Shipped: StructType<{
	small: typeof SinglePrecisionFloat;
	big: typeof DoublePrecisionFloat;
	other: typeof SinglePrecisionFloat;
	last: IntegerType<UnsignedInteger<16>>;
}>;

export type Shipped = Struct<typeof Shipped>;
