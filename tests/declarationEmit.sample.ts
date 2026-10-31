/**
 * A consumer that emits declarations and re-exports what it builds from the
 * packages under the type the compiler infers, compiled by the entry point
 * suite from a copy of the built packages under its own `node_modules`. Every
 * line is something a consumer writes without an annotation; one whose type
 * names a declaration the package does not export stops their build.
 */
import { allocate, createFixedBufferStorage, createManagedAllocator } from '@fulcro/memory';
import {
	BigInteger,
	ComplexNumber,
	Decimal,
	DoublePrecisionFloat,
	Fraction,
	HalfPrecisionFloat,
	Matrix,
	Quaternion,
	SignedInteger,
	SinglePrecisionFloat,
	struct,
	UnsignedInteger,
	Vector,
} from '@fulcro/types';

export const half = HalfPrecisionFloat;
export const single = SinglePrecisionFloat;
export const double = DoublePrecisionFloat;
export const descriptors = { half: HalfPrecisionFloat, int8: SignedInteger(8) };
export const int8 = SignedInteger(8);
export const uint128 = UnsignedInteger(128);
export const decimal = Decimal;
export const decimalRead = Decimal.read;
export const decimalLayout = Decimal.layout;
export const bigInteger = BigInteger;
export const point = struct('Point', { x: SinglePrecisionFloat, y: SinglePrecisionFloat });
export const matrix = Matrix(SinglePrecisionFloat, 2, 2);
export const vector = Vector(DoublePrecisionFloat, 3, 1);
export const fraction = Fraction(SignedInteger(32));
export const complex = ComplexNumber(DoublePrecisionFloat);
export const quaternion = Quaternion(DoublePrecisionFloat);
export const samples = createFixedBufferStorage(SinglePrecisionFloat, 4);
export const amounts = createFixedBufferStorage(Decimal, 4);
export const counts = allocate(SignedInteger(32), 4, createManagedAllocator());
