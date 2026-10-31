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
export { BigInteger } from '@/src/bigInteger';
export type { ComplexNumberType } from '@/src/complexNumber';
export { ComplexNumber } from '@/src/complexNumber';
export { Decimal } from '@/src/decimal';
export { DoublePrecisionFloat } from '@/src/doublePrecisionFloat';
export type { FixedLayoutType } from '@/src/fixedLayout';
export type { FloatType } from '@/src/float';
export type { FractionType } from '@/src/fraction';
export { Fraction } from '@/src/fraction';
export { HalfPrecisionFloat } from '@/src/halfPrecisionFloat';
export type { IntegerType, IntegerWidth } from '@/src/integer';
export type { MatrixType } from '@/src/matrix';
export { Matrix } from '@/src/matrix';
export type { BoundedNumericType, NumericType } from '@/src/numericType';
export type { QuaternionType } from '@/src/quaternion';
export { Quaternion } from '@/src/quaternion';
export type { RoundingMode } from '@/src/roundingMode';
export { SignedInteger } from '@/src/signedInteger';
export { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
export type { Struct, StructType } from '@/src/struct';
export { struct } from '@/src/struct';
export { UnsignedInteger } from '@/src/unsignedInteger';
export type { VectorType } from '@/src/vector';
export { Vector } from '@/src/vector';
