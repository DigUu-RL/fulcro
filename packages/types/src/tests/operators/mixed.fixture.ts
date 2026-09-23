import { Decimal, HalfPrecisionFloat, SignedInteger } from '@fulcro/types';

// Operands that are not the same type. Each marked line has to be a type error
// once rewritten — "the same type only" is enforced by the descriptors'
// signatures — and the suite reads the errors back by line.

const Int32 = SignedInteger(32);
const Int16 = SignedInteger(16);
const a = Int32.from(1);
const b = Int16.from(1);
const d = Decimal.from(1);
const h = HalfPrecisionFloat.from(1);

export const withNumber = a + 1; // error: number is not SignedInteger<32>
export const withOtherWidth = a * b; // error: SignedInteger<16> is not SignedInteger<32>
export const numberFirst = 2 - a; // error
export const decimalWithNumber = d * 2; // error
export const numberWithDecimal = 2 * d; // error
export const decimalBits = d & d; // error: no bit operations on a decimal
export const floatBits = h | h; // error: no bit operations on a float
export const equalityWithNumber = a === 1; // error

let accumulator = 0;

accumulator += a; // error
export const kept = accumulator;
