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
export { Decimal } from '@/decimal';
export { DoublePrecisionFloat } from '@/doublePrecisionFloat';
export { HalfPrecisionFloat } from '@/halfPrecisionFloat';
export type { IntegerType, IntegerWidth } from '@/integer';
export type { BoundedNumericType, NumericType } from '@/numericType';
export type { RoundingMode } from '@/roundingMode';
export { SignedInteger } from '@/signedInteger';
export { SinglePrecisionFloat } from '@/singlePrecisionFloat';
export { UnsignedInteger } from '@/unsignedInteger';
