/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a module below is never enough on its own to put it in front of consumers.
 * The modules export more than this — `createIntegerType`, the parts and the
 * rounding of `Decimal` — and none of it is a promise.
 *
 * Every type here has a value of the same name beside it. A consumer who wants
 * only the types imports them with `import type` and takes no code at all.
 */
export { BigInteger } from '@/bigInteger';
export type { ComplexNumberType } from '@/complexNumber';
export { ComplexNumber } from '@/complexNumber';
export { Decimal } from '@/decimal';
export { DoublePrecisionFloat } from '@/doublePrecisionFloat';
export type { FractionType } from '@/fraction';
export { Fraction } from '@/fraction';
export { HalfPrecisionFloat } from '@/halfPrecisionFloat';
export type { IntegerType, IntegerWidth } from '@/integer';
export type { MatrixType } from '@/matrix';
export { Matrix } from '@/matrix';
export type { BoundedNumericType, NumericType } from '@/numericType';
export type { QuaternionType } from '@/quaternion';
export { Quaternion } from '@/quaternion';
export type { RoundingMode } from '@/roundingMode';
export { SignedInteger } from '@/signedInteger';
export { SinglePrecisionFloat } from '@/singlePrecisionFloat';
export type { Struct, StructType } from '@/struct';
export { struct } from '@/struct';
export { UnsignedInteger } from '@/unsignedInteger';
export type { VectorType } from '@/vector';
export { Vector } from '@/vector';
