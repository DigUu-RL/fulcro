import { SignedInteger, UnsignedInteger } from '@fulcro/types';

// Operators on fixed-width integers. Every export is asserted on by the
// transformer suite, after the file has been rewritten, compiled and run.

const Int32 = SignedInteger(32);
const Byte = UnsignedInteger(8);
const Int64 = SignedInteger(64);

const seven = Int32.from(7);
const three = Int32.from(3);

export const arithmetic = [
	seven + three,
	seven - three,
	seven * three,
	seven / three,
	-seven / three,
	seven % three,
	three ** three,
];

export const unary = [-seven, +seven, ~seven];

export const comparisons = [
	seven < three,
	seven <= seven,
	seven > three,
	three >= seven,
	seven === Int32.from(7),
	seven !== three,
	seven == three,
	seven != three,
];

export const bits = [
	Byte.from(0b1100) & Byte.from(0b1010),
	Byte.from(0b1100) | Byte.from(0b1010),
	Byte.from(0b1100) ^ Byte.from(0b1010),
	~Byte.from(0),
	Byte.from(1) << Byte.from(7),
	Byte.from(0x80) >> Byte.from(7),
	Int32.from(-1) >>> Int32.from(28),
	Int32.from(-8) >> Int32.from(1),
];

// Declared from one another, so each line is only claimable once the one
// before it has been rewritten: the fixed point, across statements.
const sum = seven + three;
const square = sum * sum;
const shifted = square << Int32.from(1);
export const chained = shifted - sum;

let counter = Int32.from(0);

counter++;
++counter;
counter += three;
counter -= Int32.from(1);
counter *= three;
export const afterStatements = counter;

let value = Int32.from(10);
export const postfixReturnsPrevious = value++;
export const afterPostfix = value;
export const prefixReturnsNext = ++value;
export const postfixDecrement = value--;
export const afterDecrement = value;

// A target whose parts have side effects is evaluated once, as JavaScript
// evaluates a compound assignment's target once.
let reads = 0;

const box = { total: Int32.from(1) };
const boxes = [box];
const pick = (): typeof box => {
	reads++;

	return boxes[0];
};

pick().total += three;
pick().total++;
export const propertyTarget = box.total;
export const propertyReads = reads;

const cells = [Int32.from(5), Int32.from(6)];
let index = 0;
const next = (): number => index++;

cells[next()] *= three;
export const elementTarget = cells;
export const elementIndex = index;

let loops = Int32.from(0);

for (let step = Int32.from(0); step < Int32.from(4); step++) loops += step;

export const loopTotal = loops;

export const wide = [
	Int64.from(2n) ** Int64.from(62n),
	Int64.from(-1n) >>> Int64.from(60n),
	Int64.from(9_007_199_254_740_993n) + Int64.from(1n),
];

export const overflow = (): unknown => Int32.maximum + Int32.from(1);
export const negativeExponent = (): unknown => three ** Int32.from(-1);
export const wideShift = (): unknown => Byte.from(1) << Byte.from(8);
export const unsignedNegation = (): unknown => -Byte.from(1);
