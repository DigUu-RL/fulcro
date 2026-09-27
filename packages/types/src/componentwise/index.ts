import type { ElementType } from '@/element';

/**
 * Arithmetic over lists of components, one element type throughout.
 *
 * Internal. Every mathematics type does its addition, subtraction, negation,
 * scaling and comparison one component at a time, and its products as sums of
 * products; this module is the one place those loops are written. A matrix
 * hands it its elements, a quaternion its four components — neither knows how
 * the other is stored, and neither repeats the other's arithmetic.
 *
 * Each result is a fresh array the caller freezes into its own value.
 */

/**
 * @param element Element type of every component.
 * @param left First operand.
 * @param right Second operand, as long as the first.
 * @returns The sums, component by component.
 */
export const addEach = <T>(
	element: ElementType<T>,
	left: readonly T[],
	right: readonly T[],
): T[] => left.map((item, index) => element.add(item, right[index]));

/**
 * @param element Element type of every component.
 * @param left Components subtracted from.
 * @param right Components subtracted, as many.
 * @returns The differences, component by component.
 */
export const subtractEach = <T>(
	element: ElementType<T>,
	left: readonly T[],
	right: readonly T[],
): T[] => left.map((item, index) => element.subtract(item, right[index]));

/**
 * @param element Element type of every component.
 * @param value Components negated.
 * @returns Every component negated.
 */
export const negateEach = <T>(
	element: ElementType<T>,
	value: readonly T[],
): T[] => value.map((item) => element.negate(item));

/**
 * @param element Element type of every component.
 * @param value Components scaled.
 * @param factor Value each is multiplied by, on the right.
 * @returns Every component times the factor.
 */
export const scaleEach = <T>(
	element: ElementType<T>,
	value: readonly T[],
	factor: T,
): T[] => value.map((item) => element.multiply(item, factor));

/**
 * @param element Element type of every component.
 * @param value Components divided.
 * @param divisor Value each is divided by.
 * @returns Every component over the divisor.
 */
export const divideEach = <T>(
	element: ElementType<T>,
	value: readonly T[],
	divisor: T,
): T[] => value.map((item) => element.divide(item, divisor));

/**
 * Compares two lists component by component, stopping at the first that
 * differs.
 *
 * @param element Element type of every component.
 * @param left First operand.
 * @param right Second operand.
 * @returns `true` when both are as long and every component is equal.
 */
export const equalsEach = <T>(
	element: ElementType<T>,
	left: readonly T[],
	right: readonly T[],
): boolean =>
	left.length === right.length &&
	left.every((item, index) => element.equals(item, right[index]));

/**
 * A sum of products — a row of one matrix times a column of another, a dot
 * product, a squared norm — walking each operand with its own stride.
 *
 * It starts from the first product rather than from zero, so the element type
 * is never asked for a zero it would have to convert, and one product costs no
 * addition at all.
 *
 * @param element Element type of every component.
 * @param count Products to add up, at least one.
 * @param left Components of the left operand.
 * @param leftStart Index of its first component.
 * @param leftStride Step from one of its components to the next.
 * @param right Components of the right operand.
 * @param rightStart Index of its first component.
 * @param rightStride Step from one of its components to the next.
 * @returns The sum.
 */
export const sumOfProducts = <T>(
	element: ElementType<T>,
	count: number,
	left: readonly T[],
	leftStart: number,
	leftStride: number,
	right: readonly T[],
	rightStart: number,
	rightStride: number,
): T => {
	let sum: T = element.multiply(left[leftStart], right[rightStart]);

	for (let index = 1; index < count; index++) {
		sum = element.add(
			sum,
			element.multiply(
				left[leftStart + index * leftStride],
				right[rightStart + index * rightStride],
			),
		);
	}

	return sum;
};
