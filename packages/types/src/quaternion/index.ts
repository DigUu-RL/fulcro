import {
	type ElementDescriptor,
	type ElementSize,
	type ElementType,
	type RepeatedLayout,
	type SourceOf,
	type ValueOf,
} from '@/element';
import {
	createHypercomplexType,
	type HypercomplexType,
	type ProductRule,
} from '@/hypercomplex';
import type { Multiply } from '@/struct/arithmetic';

/**
 * A quaternion w + xi + yj + zk whose four components are of `T`.
 *
 * ```ts
 * const Rotation = Quaternion(DoublePrecisionFloat);
 * const i = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
 * const j = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });
 *
 * Rotation.multiply(i, j); // { w: 0, x: 0, y: 0, z: 1 } — k
 * Rotation.multiply(j, i); // { w: 0, x: 0, y: 0, z: -1 } — the order matters
 * ```
 *
 * The value is a frozen object with exactly `w`, `x`, `y` and `z`: the scalar
 * part, then the three coefficients of i, j and k. When `T` declares a layout,
 * so does the quaternion, its components end to end in that order.
 *
 * @template T Type of the four components.
 */
export type Quaternion<T> = {
	/** The scalar part. */
	readonly w: T;

	/** The coefficient of i. */
	readonly x: T;

	/** The coefficient of j. */
	readonly y: T;

	/** The coefficient of k. */
	readonly z: T;
} & RepeatedLayout<T, Multiply<4, ElementSize<T>>>;

/**
 * The descriptor of a quaternion type: how its values are made and recognised,
 * and their arithmetic, each component going through the descriptor of `T`.
 * Its product is Hamilton's, i² = j² = k² = ijk = −1, which does not commute.
 *
 * @template T Type of the four components.
 * @template TSource What the component type's `from` accepts.
 */
export type QuaternionType<T, TSource = number> = HypercomplexType<
	T,
	Quaternion<T>,
	TSource,
	{
		readonly w: TSource;
		readonly x: TSource;
		readonly y: TSource;
		readonly z: TSource;
	}
>;

/** The components, in the order they are stored. */
const COMPONENTS: readonly string[] = ['w', 'x', 'y', 'z'];

/** Hamilton's product, `left` then `right`. */
const hamiltonProduct: ProductRule = <T>(
	element: ElementType<T>,
	[leftW, leftX, leftY, leftZ]: readonly T[],
	[rightW, rightX, rightY, rightZ]: readonly T[],
): T[] => {
	const times = (left: T, right: T): T => element.multiply(left, right);

	return [
		element.subtract(
			element.subtract(
				element.subtract(times(leftW, rightW), times(leftX, rightX)),
				times(leftY, rightY),
			),
			times(leftZ, rightZ),
		),
		element.subtract(
			element.add(
				element.add(times(leftW, rightX), times(leftX, rightW)),
				times(leftY, rightZ),
			),
			times(leftZ, rightY),
		),
		element.add(
			element.add(
				element.subtract(times(leftW, rightY), times(leftX, rightZ)),
				times(leftY, rightW),
			),
			times(leftZ, rightX),
		),
		element.add(
			element.subtract(
				element.add(times(leftW, rightZ), times(leftX, rightY)),
				times(leftY, rightX),
			),
			times(leftZ, rightW),
		),
	];
};

/**
 * Declares a quaternion type over a component type.
 *
 * ```ts
 * const Rotation = Quaternion(DoublePrecisionFloat);
 *
 * Rotation.from(1); // { w: 1, x: 0, y: 0, z: 0 }
 * ```
 *
 * The component type is any numeric type of this package, `Decimal` and
 * `BigInteger` included, or a `Fraction`.
 *
 * @template TElement Descriptor of the component type.
 * @param element Descriptor of the component type.
 * @returns The descriptor of the quaternion type.
 * @throws {TypeError} When the component type lacks an operation a quaternion
 * needs.
 */
export const Quaternion = <TElement extends ElementDescriptor>(
	element: TElement,
): QuaternionType<ValueOf<TElement>, SourceOf<TElement>> =>
	createHypercomplexType('Quaternion', COMPONENTS, element, hamiltonProduct);
