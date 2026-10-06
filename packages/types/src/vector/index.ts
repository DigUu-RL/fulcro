import { createError } from '@fulcro/errors';

import { sumOfProducts } from '@/componentwise';
import {
	describeKind,
	type ElementDescriptor,
	type SourceOf,
	type ValueOf,
} from '@/element';
import {
	convertElements,
	createMatrixOperations,
	createValue,
	type Matrix,
	type MatrixOperations,
} from '@/matrix';

/**
 * A vector: a matrix with one row or one column.
 *
 * ```ts
 * type Point = Vector<SinglePrecisionFloat, 3, 1>; // a column
 * type Weights = Vector<SinglePrecisionFloat, 1, 3>; // a row
 * ```
 *
 * The same type as {@link Matrix} of that shape, not a second one beside it, so
 * a vector goes wherever a matrix of its shape goes — `Transform.multiply(shift,
 * point)` needs no conversion. There is no `Vector3D`: the dimensions are type
 * parameters.
 *
 * @template T Type of the elements.
 * @template R Number of rows; `1` for a row vector.
 * @template C Number of columns; `1` for a column vector.
 */
export type Vector<T, R extends number, C extends number> = Matrix<T, R, C>;

/**
 * Nothing, when a shape is one row or one column; otherwise a property no
 * value has, whose type is the reason the compiler quotes.
 *
 * @template R Rows declared.
 * @template C Columns declared.
 */
type VectorShapeCheck<R extends number, C extends number> = 1 extends R | C
	? unknown
	: {
			readonly '~error': `A vector has one row or one column; Vector<T, ${R}, ${C}> has neither. Declare it with Matrix.`;
		};

/**
 * The descriptor of a vector shape.
 *
 * @template T Type of the elements.
 * @template R Number of rows.
 * @template C Number of columns.
 * @template TSource What the element type's `from` accepts.
 */
export interface VectorType<
	T,
	R extends number,
	C extends number,
	TSource = number,
> extends MatrixOperations<T, R, C> {
	/**
	 * Makes a vector from its elements, converting each with the element type's
	 * own `from`. One list, whether the vector is a row or a column.
	 *
	 * @param elements The elements, as many as the vector has.
	 * @returns The vector, frozen.
	 * @throws {TypeError} When `elements` is not an array.
	 * @throws {RangeError} When there are not as many elements as the vector has;
	 * and when an element's own conversion refuses it, with the message naming
	 * its index and the class and code of the original error.
	 */
	from(elements: readonly TSource[]): Vector<T, R, C>;

	/**
	 * The dot product: the sum of the products of matching elements.
	 *
	 * @param left First vector.
	 * @param right Second vector.
	 * @returns The sum, of the element type.
	 * @throws {RangeError} When an operand has another shape.
	 */
	dot(left: Vector<T, R, C>, right: Vector<T, R, C>): T;
}

/**
 * Declares a vector shape: its element type, and one row or one column.
 *
 * ```ts
 * const Point = Vector(SinglePrecisionFloat, 3, 1);
 * const up = Point.from([0, 1, 0]);
 *
 * Point.dot(up, up); // 1
 * Point.add(up, up); // [0, 2, 0]
 * ```
 *
 * A shape with neither one row nor one column does not compile, and throws for
 * a caller that got past the compiler: it is a matrix.
 *
 * @template TElement Descriptor of the element type.
 * @template R Number of rows, a literal so that the compiler can check shapes.
 * @template C Number of columns, likewise.
 * @param element Descriptor of the element type.
 * @param rows Number of rows, a positive integer.
 * @param columns Number of columns, a positive integer; one of the two is 1.
 * @returns The descriptor of the shape.
 * @throws {TypeError} When the element type lacks an operation a vector needs.
 * @throws {RangeError} When a dimension is not a positive integer, or neither
 * is 1.
 */
export const Vector = <
	TElement extends ElementDescriptor,
	R extends number,
	C extends number,
>(
	element: TElement,
	rows: R,
	columns: C & VectorShapeCheck<R, C>,
): VectorType<ValueOf<TElement>, R, C, SourceOf<TElement>> => {
	type T = ValueOf<TElement>;

	const {
		name,
		operations,
		element: elementType,
		requireShape,
		register,
	} = createMatrixOperations<T, R, C>('Vector', element, rows, columns);

	if ((rows as number) !== 1 && (columns as number) !== 1) {
		throw createError('FULCRO6040', {
			operation: 'Vector',
			rows: String(rows),
			columns: String(columns),
		});
	}

	const count: number = rows * columns;

	const descriptor: VectorType<T, R, C, SourceOf<TElement>> = {
		...operations,

		from: (elements) => {
			if (!Array.isArray(elements)) {
				throw createError('FULCRO6034', {
					operation: `${name}.from`,
					received: describeKind(elements),
				});
			}

			if (elements.length !== count) {
				throw createError('FULCRO6038', {
					operation: `${name}.from`,
					expected: `${count} elements`,
					received: String(elements.length),
				});
			}

			// A vector's elements are one row of `count`, whichever way it stands;
			// the value then takes the shape the vector was declared with.
			return createValue(
				convertElements(
					`${name}.from`,
					elementType,
					[elements],
					1,
					count,
					(_row, column) => `element ${column}`,
				),
				rows,
				columns,
			) as Vector<T, R, C>;
		},

		dot: (left, right) => {
			requireShape(`${name}.dot`, left);
			requireShape(`${name}.dot`, right);

			return sumOfProducts(elementType, count, left, 0, 1, right, 0, 1);
		},
	};

	register(descriptor);

	return descriptor;
};
