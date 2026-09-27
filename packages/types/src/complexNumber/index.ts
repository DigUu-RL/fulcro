import {
	type ElementDescriptor,
	type ElementSize,
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
 * A complex number whose two parts are of `T`.
 *
 * ```ts
 * const Complex = ComplexNumber(DoublePrecisionFloat);
 * const i = Complex.from({ real: 0, imaginary: 1 });
 *
 * Complex.multiply(i, i); // { real: -1, imaginary: 0 }
 * ```
 *
 * The value is a frozen object with exactly `real` and `imaginary`. When `T`
 * declares a layout, so does the complex number: the real part, then the
 * imaginary one.
 *
 * @template T Type of the two parts.
 */
export type ComplexNumber<T> = {
	/** The real part. */
	readonly real: T;

	/** The imaginary part, the coefficient of i. */
	readonly imaginary: T;
} & RepeatedLayout<T, Multiply<2, ElementSize<T>>>;

/**
 * The descriptor of a complex number type: how its values are made and
 * recognised, and their arithmetic, each part going through the descriptor of
 * `T`. Its product is (a + bi)(c + di) = (ac − bd) + (ad + bc)i.
 *
 * @template T Type of the two parts.
 * @template TSource What the part type's `from` accepts.
 */
export type ComplexNumberType<T, TSource = number> = HypercomplexType<
	T,
	ComplexNumber<T>,
	TSource,
	{ readonly real: TSource; readonly imaginary: TSource }
>;

/** The parts, in the order they are stored. */
const PARTS: readonly string[] = ['real', 'imaginary'];

/** (a + bi)(c + di) = (ac − bd) + (ad + bc)i. */
const complexProduct: ProductRule = (element, [a, b], [c, d]) => [
	element.subtract(element.multiply(a, c), element.multiply(b, d)),
	element.add(element.multiply(a, d), element.multiply(b, c)),
];

/**
 * Declares a complex number type over a part type.
 *
 * ```ts
 * const Complex = ComplexNumber(DoublePrecisionFloat);
 *
 * Complex.from(2); // { real: 2, imaginary: 0 }
 * Complex.divide(Complex.from({ real: 1, imaginary: 1 }), Complex.from(2));
 * // { real: 0.5, imaginary: 0.5 }
 * ```
 *
 * The part type is any numeric type of this package, `Decimal` and
 * `BigInteger` included, or a `Fraction`.
 *
 * @template TElement Descriptor of the part type.
 * @param element Descriptor of the part type.
 * @returns The descriptor of the complex number type.
 * @throws {TypeError} When the part type lacks an operation a complex number
 * needs.
 */
export const ComplexNumber = <TElement extends ElementDescriptor>(
	element: TElement,
): ComplexNumberType<ValueOf<TElement>, SourceOf<TElement>> =>
	createHypercomplexType('ComplexNumber', PARTS, element, complexProduct);
