import { constantOf, layoutOf, sizeOf } from '@fulcro/reflect';
import {
	type ComplexNumber,
	type Decimal,
	type DoublePrecisionFloat,
	type Fraction,
	Matrix,
	type Quaternion,
	type SignedInteger,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
	type Vector,
} from '@fulcro/types';

/**
 * Fixture of `mathematics.spec.mts`: the layouts the mathematics types of
 * `@fulcro/types` declare, read by the `@fulcro/reflect` transformer across the
 * package boundary — from the built declarations, as a consumer's compiler
 * reads them — and a constant evaluated beside them.
 */

export const Transform = Matrix(SinglePrecisionFloat, 3, 4);

/** A matrix among other fields, so its place in the struct is computed too. */
export const Holder = struct('Holder', {
	tag: UnsignedInteger(8),
	transform: Transform,
});

export const transformSize = sizeOf<Matrix<SinglePrecisionFloat, 3, 4>>();

export const pointSize = sizeOf<Vector<DoublePrecisionFloat, 3, 1>>();

export const complexSize = sizeOf<ComplexNumber<DoublePrecisionFloat>>();

export const fractionSize = sizeOf<Fraction<SignedInteger<16>>>();

export const quaternionSize = sizeOf<Quaternion<Decimal>>();

export const holderLayout = layoutOf<Struct<typeof Holder>>();

export const squares = constantOf(() =>
	Array.from({ length: 4 }, (_, index) => index * index),
);
