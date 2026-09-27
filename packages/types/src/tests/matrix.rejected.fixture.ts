import { Matrix } from '@/matrix';
import { SinglePrecisionFloat } from '@/singlePrecisionFloat';
import { Vector } from '@/vector';

// Each line the compiler has to refuse is followed by a comment saying why; the
// suite asserts the refusals land on exactly those lines, and nowhere else.

const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Square = Matrix(SinglePrecisionFloat, 3, 3);
const Point = Vector(SinglePrecisionFloat, 4, 1);
const Short = Vector(SinglePrecisionFloat, 2, 1);

const shift = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);
const point = Point.from([1, 2, 3, 1]);
const short = Short.from([1, 2]);

export const moved = Transform.multiply(shift, point);
export const mismatched = Transform.multiply(shift, short);
// A vector of 2 rows, where the matrix has 4 columns.

export const squared = Transform.multiply(shift, shift);
// A 3 × 4 matrix, where 4 rows are needed.

export const identity = Square.identity();
export const notSquare = Transform.identity();
// A 3 × 4 matrix has no identity.

export const added = Transform.add(shift, shift);
export const addedToOther = Square.add(Square.identity(), shift);
// Two matrices of different shapes.
