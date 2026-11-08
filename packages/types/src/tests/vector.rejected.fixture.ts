import { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
import { Vector } from '@/src/vector';

// Each line the compiler has to refuse is followed by a comment saying why; the
// suite asserts the refusals land on exactly those lines, and nowhere else.

const Heading = Vector(SinglePrecisionFloat, 4, 1);
const Short = Vector(SinglePrecisionFloat, 2, 1);
const Row = Vector(SinglePrecisionFloat, 1, 4);

const point = Heading.from([1, 2, 3, 1]);
const short = Short.from([1, 2]);
const row = Row.from([1, 2, 3, 4]);

export const Wide = Vector(SinglePrecisionFloat, 2, 3);
// Neither one row nor one column.

export const product = Heading.dot(point, point);
export const mismatched = Heading.dot(point, short);
// Two vectors of different lengths.

export const crossed = Heading.dot(point, row);
// A column and a row, of the same length but not the same shape.

export const projected = Row.multiply(row, point);
