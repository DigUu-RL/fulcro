import {
	BigInteger,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SinglePrecisionFloat,
} from '@fulcro/types';

// Operators on the floats and on BigInteger.

const tenth = SinglePrecisionFloat.from(0.1);
const fifth = SinglePrecisionFloat.from(0.2);

export const single = [
	tenth + fifth,
	fifth - tenth,
	tenth * fifth,
	fifth / tenth,
	fifth ** tenth,
];

const one = HalfPrecisionFloat.from(1);
const tiny = HalfPrecisionFloat.from(2 ** -11);

export const half = [
	one + tiny,
	one - one,
	-one,
	one > tiny,
	one === HalfPrecisionFloat.from(1),
];

let large = HalfPrecisionFloat.from(2048);

large++;
export const halfIncrement = large;

const x = DoublePrecisionFloat.from(0.1);

export const double = [x + x, x * x, x % x];

const big = BigInteger.from(2n);

export const integers = [
	big ** BigInteger.from(100n),
	big - BigInteger.from(5n),
	-big,
	big < BigInteger.from(3n),
];

export const bigDivision = (): unknown => big / BigInteger.from(0n);
