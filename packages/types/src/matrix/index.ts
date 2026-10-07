import { createError, prefixError } from '@fulcro/errors';

import {
	addEach,
	equalsEach,
	negateEach,
	scaleEach,
	subtractEach,
	sumOfProducts,
} from '@/componentwise';
import {
	describeKind,
	describeType,
	type ElementDescriptor,
	elementOf,
	type ElementSize,
	type ElementType,
	type RepeatedLayout,
	type SourceOf,
	type ValueOf,
} from '@/element';
import type { Multiply } from '@/struct/arithmetic';
import { registerRepeatedCodec } from '@/struct/codec';

/**
 * A matrix of `R` rows and `C` columns of `T`.
 *
 * ```ts
 * const Transform = Matrix(SinglePrecisionFloat, 3, 4);
 * const shift: Matrix<SinglePrecisionFloat, 3, 4> = Transform.from([
 * 	[1, 0, 0, 5],
 * 	[0, 1, 0, 0],
 * 	[0, 0, 1, 0],
 * ]);
 *
 * shift[3]; // 5 — row 0, column 3
 * shift.rows; // 3
 * ```
 *
 * The value is a frozen array of its elements, row after row, so it indexes,
 * spreads and serialises as the numbers it holds; `rows` and `columns` sit on it
 * as properties that are not listed. The dimensions are type parameters, never
 * part of a name: there is no `Matrix3x4`, and a vector is a matrix with one
 * row or one column — see `Vector`.
 *
 * When `T` declares a layout, so does the matrix: its elements end to end,
 * `R × C` of them, row after row, with the alignment of one. So a matrix can be
 * the field of a struct, and `sizeOf<Matrix<SinglePrecisionFloat, 3, 4>>()` is
 * 48.
 *
 * @template T Type of the elements.
 * @template R Number of rows.
 * @template C Number of columns.
 */
export type Matrix<T, R extends number, C extends number> = readonly T[] & {
	/** Number of rows. */
	readonly rows: R;

	/** Number of columns. */
	readonly columns: C;
} & RepeatedLayout<T, Multiply<Multiply<R, C>, ElementSize<T>>>;

/** How a shape reads in a message: a vector when it has one row or column. */
type ShapeName<R extends number, C extends number> = 1 extends R | C
	? 'Vector'
	: 'Matrix';

/**
 * Nothing, when a product is defined; otherwise a property no value has, whose
 * type is the reason — so the compiler's refusal of the argument quotes it.
 *
 * @template R Rows of the left operand.
 * @template C Columns of the left operand.
 * @template TRows Rows of the right operand.
 * @template TColumns Columns of the right operand.
 */
export type MultiplicationCheck<
	R extends number,
	C extends number,
	TRows extends number,
	TColumns extends number,
> = [TRows] extends [C]
	? unknown
	: {
			readonly '~error': `Cannot multiply ${ShapeName<R, C>}<T, ${R}, ${C}> by ${ShapeName<TRows, TColumns>}<T, ${TRows}, ${TColumns}>. Expected a ${Lowercase<ShapeName<TRows, TColumns>>} with ${C} rows.`;
		};

/**
 * What a matrix and a vector of one shape have in common: recognising a value,
 * and the arithmetic of matrices.
 *
 * Every operation goes through the descriptor of `T`, so the arithmetic keeps
 * that type's promise — a matrix of `SignedInteger<8>` throws where an element
 * would leave its range, and one of `SinglePrecisionFloat` rounds each product
 * and each sum as that type does.
 *
 * @template T Type of the elements.
 * @template R Number of rows.
 * @template C Number of columns.
 */
export interface MatrixOperations<T, R extends number, C extends number> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/** Number of rows. */
	readonly rows: R;

	/** Number of columns. */
	readonly columns: C;

	/**
	 * Tells whether a value is a matrix of this shape: frozen, with `R × C`
	 * elements, each of the element type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is Matrix<T, R, C>;

	/**
	 * Compares two matrices element by element, as the element type compares.
	 *
	 * @param left First matrix.
	 * @param right Second matrix.
	 * @returns `true` when every element is equal; `false` for another shape.
	 */
	equals(left: Matrix<T, R, C>, right: Matrix<T, R, C>): boolean;

	/**
	 * Adds two matrices element by element.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The sum.
	 * @throws {RangeError} When an operand has another shape.
	 */
	add(left: Matrix<T, R, C>, right: Matrix<T, R, C>): Matrix<T, R, C>;

	/**
	 * Subtracts one matrix from another element by element.
	 *
	 * @param left Matrix subtracted from.
	 * @param right Matrix subtracted.
	 * @returns The difference.
	 * @throws {RangeError} When an operand has another shape.
	 */
	subtract(left: Matrix<T, R, C>, right: Matrix<T, R, C>): Matrix<T, R, C>;

	/**
	 * Negates every element.
	 *
	 * @param value Matrix negated.
	 * @returns The negation.
	 */
	negate(value: Matrix<T, R, C>): Matrix<T, R, C>;

	/**
	 * Multiplies every element by one value.
	 *
	 * @param value Matrix scaled.
	 * @param factor Value every element is multiplied by, on the right.
	 * @returns The scaled matrix.
	 */
	scale(value: Matrix<T, R, C>, factor: T): Matrix<T, R, C>;

	/**
	 * The matrix product: each element of the result is a row of `left` times a
	 * column of `right`. Defined when `right` has as many rows as `left` has
	 * columns, and checked by the compiler:
	 *
	 * ```ts
	 * Transform.multiply(shift, point); // Matrix<T, 3, 1>, point being 4 × 1
	 * Transform.multiply(shift, shift);
	 * // Cannot multiply Matrix<T, 3, 4> by Matrix<T, 3, 4>. Expected a matrix with 4 rows.
	 * ```
	 *
	 * The order of the operands is kept: elements whose own multiplication does
	 * not commute, such as quaternions, are multiplied as written.
	 *
	 * @template TRows Rows of `right`, which must be `C`.
	 * @template TColumns Columns of `right`, and of the product.
	 * @param left Matrix on the left.
	 * @param right Matrix on the right.
	 * @returns The product, of `R` rows and `TColumns` columns.
	 * @throws {RangeError} When the shapes do not multiply, for a caller that
	 * got past the compiler.
	 */
	multiply<TRows extends number, TColumns extends number>(
		left: Matrix<T, R, C>,
		right: Matrix<T, TRows, TColumns> &
			MultiplicationCheck<R, C, TRows, TColumns>,
	): Matrix<T, R, TColumns>;

	/**
	 * Swaps rows and columns.
	 *
	 * @param value Matrix transposed.
	 * @returns The transpose, of `C` rows and `R` columns.
	 */
	transpose(value: Matrix<T, R, C>): Matrix<T, C, R>;
}

/**
 * The descriptor of a matrix shape: how its values are made and recognised, and
 * their arithmetic.
 *
 * @template T Type of the elements.
 * @template R Number of rows.
 * @template C Number of columns.
 * @template TSource What the element type's `from` accepts.
 */
export interface MatrixType<
	T,
	R extends number,
	C extends number,
	TSource = number,
> extends MatrixOperations<T, R, C> {
	/**
	 * Makes a matrix from its rows, converting each element with the element
	 * type's own `from`.
	 *
	 * @param rows `R` rows of `C` elements each.
	 * @returns The matrix, frozen.
	 * @throws {TypeError} When `rows` or a row is not an array.
	 * @throws {RangeError} When there are not `R` rows of `C` elements; and when
	 * an element's own conversion refuses it, with the message naming the row
	 * and the column and the class and code of the original error.
	 */
	from(rows: readonly (readonly TSource[])[]): Matrix<T, R, C>;

	/**
	 * The identity: one on the diagonal, zero everywhere else. Only a square
	 * matrix has one, and calling it on another shape does not compile.
	 *
	 * @returns The identity matrix.
	 * @throws {RangeError} When the matrix is not square, for a caller that got
	 * past the compiler.
	 */
	identity(this: MatrixType<T, R, R, TSource>): Matrix<T, R, R>;
}

/**
 * Makes a value: the elements, frozen, carrying the shape.
 *
 * @param elements Elements, row after row; frozen in place.
 * @param rows Number of rows.
 * @param columns Number of columns.
 * @returns The value.
 */
export const createValue = <T>(
	elements: T[],
	rows: number,
	columns: number,
): readonly T[] =>
	Object.freeze(
		Object.defineProperties(elements, {
			rows: { value: rows, enumerable: false },
			columns: { value: columns, enumerable: false },
		}),
	);

/**
 * The shape of an operand, as it carries it.
 *
 * @param operation Operation being performed.
 * @param value Operand handed in.
 * @returns Its rows and columns.
 * @throws {TypeError} When the operand is not a matrix.
 */
const shapeOf = (
	operation: string,
	value: unknown,
): { readonly rows: number; readonly columns: number } => {
	if (!Array.isArray(value)) {
		throw createError('FULCRO6034', {
			operation,
			received: describeKind(value),
		});
	}

	const { rows, columns } = value as { rows?: unknown; columns?: unknown };

	if (
		typeof rows !== 'number' ||
		typeof columns !== 'number' ||
		rows * columns !== value.length
	) {
		throw createError('FULCRO6034', {
			operation,
			received: 'an array without a shape',
		});
	}

	return { rows, columns };
};

/**
 * Checks that a dimension a shape is declared with is a positive integer.
 *
 * @param operation Operation declaring the shape.
 * @param dimension Which dimension it is.
 * @param value Value handed in.
 * @throws {RangeError} When it is not.
 */
const requireDimension = (
	operation: string,
	dimension: 'rows' | 'columns',
	value: unknown,
): void => {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
		throw createError('FULCRO6035', {
			operation,
			dimension,
			received: String(value),
		});
	}
};

/**
 * How a shape reads in a message.
 *
 * @param element Name of the element type.
 * @param rows Number of rows.
 * @param columns Number of columns.
 * @returns `Matrix<…>`, or `Vector<…>` with one row or one column.
 */
const describeShape = (
	element: string,
	rows: number,
	columns: number,
): string =>
	describeType(
		rows === 1 || columns === 1 ? 'Vector' : 'Matrix',
		element,
		rows,
		columns,
	);

/**
 * Builds what a matrix and a vector of one shape share, and the registration
 * of the codec that lets the shape be a field of a struct.
 *
 * The arithmetic itself is `componentwise`'s: this module decides only what a
 * matrix adds to it — shapes, and which elements meet in a product.
 *
 * @param family Name of the family, `Matrix` or `Vector`.
 * @param elementDescriptor What the elements were declared with.
 * @param rows Number of rows.
 * @param columns Number of columns.
 * @returns The name of the shape, the operations, the element type they go
 * through, the check an operand of this shape passes, and the registration of
 * a descriptor's codec.
 * @throws {TypeError} When the element type lacks an operation.
 * @throws {RangeError} When a dimension is not a positive integer.
 */
export const createMatrixOperations = <T, R extends number, C extends number>(
	family: string,
	elementDescriptor: unknown,
	rows: R,
	columns: C,
): {
	readonly name: string;
	readonly operations: MatrixOperations<T, R, C>;
	readonly element: ElementType<T>;
	readonly requireShape: (operation: string, value: unknown) => void;
	readonly register: (descriptor: object) => void;
} => {
	const element: ElementType<T> = elementOf<T>(elementDescriptor, family);

	requireDimension(family, 'rows', rows);
	requireDimension(family, 'columns', columns);

	const name: string = describeType(family, element.name, rows, columns);
	const count: number = rows * columns;

	type Value = Matrix<T, R, C>;

	/**
	 * Refuses an operand of another shape.
	 *
	 * @param operation Operation being performed.
	 * @param value Operand handed in.
	 */
	const requireShape = (operation: string, value: unknown): void => {
		const shape = shapeOf(operation, value);

		if (shape.rows !== rows || shape.columns !== columns) {
			throw createError('FULCRO6036', {
				operation,
				expected: name,
				received: describeShape(element.name, shape.rows, shape.columns),
			});
		}
	};

	/**
	 * @param elements Elements of a result of this shape.
	 * @returns The value.
	 */
	const shaped = (elements: T[]): Value =>
		createValue(elements, rows, columns) as Value;

	const operations: MatrixOperations<T, R, C> = {
		name,
		rows,
		columns,

		is: (value): value is Value => {
			if (
				!Array.isArray(value) ||
				!Object.isFrozen(value) ||
				value.length !== count
			) {
				return false;
			}

			const shape = value as { rows?: unknown; columns?: unknown };

			return (
				shape.rows === rows &&
				shape.columns === columns &&
				value.every((item) => element.is(item))
			);
		},

		equals: (left, right) => {
			const leftShape = shapeOf(`${name}.equals`, left);
			const rightShape = shapeOf(`${name}.equals`, right);

			return (
				leftShape.rows === rightShape.rows &&
				leftShape.columns === rightShape.columns &&
				equalsEach(element, left, right)
			);
		},

		add: (left, right) => {
			requireShape(`${name}.add`, left);
			requireShape(`${name}.add`, right);

			return shaped(addEach(element, left, right));
		},

		subtract: (left, right) => {
			requireShape(`${name}.subtract`, left);
			requireShape(`${name}.subtract`, right);

			return shaped(subtractEach(element, left, right));
		},

		negate: (value) => {
			requireShape(`${name}.negate`, value);

			return shaped(negateEach(element, value));
		},

		scale: (value, factor) => {
			requireShape(`${name}.scale`, value);

			return shaped(scaleEach(element, value, factor));
		},

		multiply: <TRows extends number, TColumns extends number>(
			left: Value,
			right: Matrix<T, TRows, TColumns>,
		): Matrix<T, R, TColumns> => {
			requireShape(`${name}.multiply`, left);

			const shape = shapeOf(`${name}.multiply`, right);

			if (shape.rows !== columns) {
				throw createError('FULCRO6037', {
					operation: `${name}.multiply`,
					left: describeShape(element.name, rows, columns),
					right: describeShape(element.name, shape.rows, shape.columns),
					expected: `${shape.columns === 1 ? 'a vector' : 'a matrix'} with ${columns} rows`,
				});
			}

			const width: number = shape.columns;
			const elements: T[] = new Array<T>(rows * width);

			// Row `row` of the left operand, walked one element at a time, against
			// column `column` of the right one, walked one row at a time.
			for (let row = 0; row < rows; row++) {
				for (let column = 0; column < width; column++) {
					elements[row * width + column] = sumOfProducts(
						element,
						columns,
						left,
						row * columns,
						1,
						right,
						column,
						width,
					);
				}
			}

			return createValue(elements, rows, width) as Matrix<T, R, TColumns>;
		},

		transpose: (value) => {
			requireShape(`${name}.transpose`, value);

			const elements: T[] = new Array<T>(count);

			for (let row = 0; row < rows; row++) {
				for (let column = 0; column < columns; column++) {
					elements[column * rows + row] = value[row * columns + column];
				}
			}

			return createValue(elements, columns, rows) as Matrix<T, C, R>;
		},
	};

	/**
	 * Registers the codec of a descriptor of this shape, when its element type
	 * has a fixed layout: the elements end to end, row after row.
	 *
	 * @param descriptor The descriptor, matrix or vector.
	 */
	const register = (descriptor: object): void =>
		registerRepeatedCodec(
			descriptor,
			elementDescriptor,
			count,
			(elements) => createValue(elements, rows, columns),
			(value) => value as readonly unknown[],
			(left, right) => operations.equals(left as Value, right as Value),
		);

	return { name, operations, element, requireShape, register };
};

/**
 * Converts the elements handed to a `from`, row after row.
 *
 * @param operation Operation being performed.
 * @param element Element type converting each one.
 * @param rows Rows as handed in.
 * @param rowCount Rows expected.
 * @param columnCount Columns expected.
 * @param label How an element's position reads in an error message.
 * @returns The converted elements.
 */
export const convertElements = <T>(
	operation: string,
	element: ElementType<T>,
	rows: readonly (readonly unknown[])[],
	rowCount: number,
	columnCount: number,
	label: (row: number, column: number) => string,
): T[] => {
	if (!Array.isArray(rows)) {
		throw createError('FULCRO6034', {
			operation,
			received: describeKind(rows),
		});
	}

	if (rows.length !== rowCount) {
		throw createError('FULCRO6038', {
			operation,
			expected: `${rowCount} rows`,
			received: String(rows.length),
		});
	}

	const elements: T[] = new Array<T>(rowCount * columnCount);

	for (let row = 0; row < rowCount; row++) {
		const items: unknown = rows[row];

		if (!Array.isArray(items)) {
			throw createError('FULCRO6034', {
				operation,
				received: describeKind(items),
			});
		}

		if (items.length !== columnCount) {
			throw createError('FULCRO6038', {
				operation,
				expected: `${columnCount} elements in row ${row}`,
				received: String(items.length),
			});
		}

		for (let column = 0; column < columnCount; column++) {
			try {
				elements[row * columnCount + column] = element.from(
					items[column] as number,
				);
			} catch (error) {
				throw prefixError(error, `${operation}: ${label(row, column)}`);
			}
		}
	}

	return elements;
};

/**
 * Declares a matrix shape: its element type and its dimensions.
 *
 * ```ts
 * const Rotation = Matrix(DoublePrecisionFloat, 2, 2);
 * const quarter = Rotation.from([
 * 	[0, -1],
 * 	[1, 0],
 * ]);
 *
 * Rotation.multiply(quarter, quarter); // [-1, 0, 0, -1]
 * Rotation.identity(); // [1, 0, 0, 1]
 * ```
 *
 * The element type is any numeric type of this package — including `Decimal`
 * and `BigInteger` — or a `Fraction`, a `ComplexNumber` or a `Quaternion`.
 *
 * @template TElement Descriptor of the element type.
 * @template R Number of rows, a literal so that the compiler can check shapes.
 * @template C Number of columns, likewise.
 * @param element Descriptor of the element type.
 * @param rows Number of rows, a positive integer.
 * @param columns Number of columns, a positive integer.
 * @returns The descriptor of the shape.
 * @throws {TypeError} When the element type lacks an operation a matrix needs.
 * @throws {RangeError} When a dimension is not a positive integer.
 */
export const Matrix = <
	TElement extends ElementDescriptor,
	R extends number,
	C extends number,
>(
	element: TElement,
	rows: R,
	columns: C,
): MatrixType<ValueOf<TElement>, R, C, SourceOf<TElement>> => {
	type T = ValueOf<TElement>;

	const {
		name,
		operations,
		element: elementType,
		register,
	} = createMatrixOperations<T, R, C>('Matrix', element, rows, columns);

	let identity: Matrix<T, R, R> | undefined;

	const descriptor: MatrixType<T, R, C, SourceOf<TElement>> = {
		...operations,

		from: (source) =>
			createValue(
				convertElements(
					`${name}.from`,
					elementType,
					source,
					rows,
					columns,
					(row, column) => `row ${row}, column ${column}`,
				),
				rows,
				columns,
			) as Matrix<T, R, C>,

		identity: () => {
			if ((rows as number) !== columns) {
				throw createError('FULCRO6039', {
					operation: `${name}.identity`,
					name,
				});
			}

			// Built once: the value is frozen, so every caller can share it, and
			// the element type is asked for its zero and its one a single time.
			if (identity === undefined) {
				const zero: T = elementType.from(0);
				const one: T = elementType.from(1);
				const elements: T[] = new Array<T>(rows * rows).fill(zero);

				for (let index = 0; index < rows; index++) {
					elements[index * rows + index] = one;
				}

				identity = createValue(elements, rows, rows) as Matrix<T, R, R>;
			}

			return identity;
		},
	};

	register(descriptor);

	return descriptor;
};
