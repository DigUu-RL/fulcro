import { createComponentRecord } from '@/components';
import {
	addEach,
	divideEach,
	equalsEach,
	negateEach,
	scaleEach,
	subtractEach,
	sumOfProducts,
} from '@/componentwise';
import { describeType, elementOf, type ElementType } from '@/element';

/**
 * The descriptor of a hypercomplex number type — a real part and some
 * imaginary ones, all of `T` — as `ComplexNumber` and `Quaternion` both are.
 *
 * Everything but the product is the same for every such type: the arithmetic
 * one component at a time, the conjugate that negates every imaginary part,
 * and a quotient that is the dividend times the divisor's conjugate over the
 * divisor's squared norm. Each type supplies only its product.
 *
 * There is no `lessThan`: these numbers have no order that agrees with their
 * arithmetic, so none is offered.
 *
 * @template T Type of the components.
 * @template TValue Type of the values.
 * @template TSource What the component type's `from` accepts.
 * @template TComponents The object of components `from` accepts.
 */
export interface HypercomplexType<T, TValue, TSource, TComponents> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/**
	 * Makes a value: from all its components, or from a real number alone,
	 * whose imaginary parts are then zero.
	 *
	 * @param value The components, or a real number.
	 * @returns The value, frozen.
	 * @throws {TypeError} When a component is missing or not one of the type's.
	 * @throws {RangeError} When a component's own conversion refuses it.
	 */
	from(value: TSource | TComponents): TValue;

	/**
	 * Tells whether a value is one of this type's: frozen, with exactly its
	 * components, each of the component type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is TValue;

	/**
	 * Compares every component, as the component type compares.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when every component is equal.
	 */
	equals(left: TValue, right: TValue): boolean;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The sum, component by component.
	 */
	add(left: TValue, right: TValue): TValue;

	/**
	 * @param left Value subtracted from.
	 * @param right Value subtracted.
	 * @returns The difference, component by component.
	 */
	subtract(left: TValue, right: TValue): TValue;

	/**
	 * The product of the type, `left` then `right`; the order matters for a
	 * type whose product does not commute.
	 *
	 * @param left Value on the left.
	 * @param right Value on the right.
	 * @returns The product.
	 */
	multiply(left: TValue, right: TValue): TValue;

	/**
	 * `left` times the inverse of `right`: `left × conjugate(right) / |right|²`.
	 *
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The quotient; what the component type's division gives for a zero
	 * divisor — infinities or `NaN` for a float, an error for an integer.
	 */
	divide(left: TValue, right: TValue): TValue;

	/**
	 * @param value Value negated.
	 * @returns Every component negated.
	 */
	negate(value: TValue): TValue;

	/**
	 * @param value Value conjugated.
	 * @returns The same real part, and every imaginary part negated.
	 */
	conjugate(value: TValue): TValue;

	/**
	 * Multiplies every component by one value.
	 *
	 * @param value Value scaled.
	 * @param factor Value every component is multiplied by, on the right.
	 * @returns The scaled value.
	 */
	scale(value: TValue, factor: T): TValue;
}

/**
 * The product of a hypercomplex type, over its components in declared order.
 *
 * @template T Type of the components.
 */
export type ProductRule = <T>(
	element: ElementType<T>,
	left: readonly T[],
	right: readonly T[],
) => T[];

/**
 * Builds a hypercomplex number type from what distinguishes it.
 *
 * @param family Name of the family, `ComplexNumber` or `Quaternion`.
 * @param components Names of the components, the real part first, in the order
 * they are stored.
 * @param elementDescriptor What the component type was declared with.
 * @param product The type's product.
 * @returns The descriptor.
 * @throws {TypeError} When the component type lacks an operation.
 */
export const createHypercomplexType = <T, TValue, TSource, TComponents>(
	family: string,
	components: readonly string[],
	elementDescriptor: unknown,
	product: ProductRule,
): HypercomplexType<T, TValue, TSource, TComponents> => {
	const element: ElementType<T> = elementOf<T>(elementDescriptor, family);
	const name: string = describeType(family, element.name);
	const { make, convert, isRecord, register } = createComponentRecord<
		T,
		TValue
	>(components, element, elementDescriptor);
	const count: number = components.length;

	let zero: T | undefined;

	/**
	 * @param value A value.
	 * @returns Its components, in declared order.
	 */
	const componentsOf = (value: TValue): T[] =>
		components.map((key) => (value as Record<string, T>)[key]);

	/**
	 * @param value Components of a value.
	 * @returns The same real part, and every imaginary part negated.
	 */
	const conjugateOf = (value: readonly T[]): T[] => [
		value[0],
		...negateEach(element, value.slice(1)),
	];

	const equals = (left: TValue, right: TValue): boolean =>
		equalsEach(element, componentsOf(left), componentsOf(right));

	const descriptor: HypercomplexType<T, TValue, TSource, TComponents> = {
		name,

		from: (value) => {
			const converted: T[] | null = convert(`${name}.from`, value);

			if (converted !== null) return make(...converted);

			zero ??= element.from(0);

			return make(
				element.from(value as number),
				...new Array<T>(count - 1).fill(zero),
			);
		},

		is: isRecord,
		equals,

		add: (left, right) =>
			make(...addEach(element, componentsOf(left), componentsOf(right))),

		subtract: (left, right) =>
			make(...subtractEach(element, componentsOf(left), componentsOf(right))),

		multiply: (left, right) =>
			make(...product(element, componentsOf(left), componentsOf(right))),

		divide: (left, right) => {
			const divisor: T[] = componentsOf(right);
			const norm: T = sumOfProducts(
				element,
				count,
				divisor,
				0,
				1,
				divisor,
				0,
				1,
			);

			return make(
				...divideEach(
					element,
					product(element, componentsOf(left), conjugateOf(divisor)),
					norm,
				),
			);
		},

		negate: (value) => make(...negateEach(element, componentsOf(value))),

		conjugate: (value) => make(...conjugateOf(componentsOf(value))),

		scale: (value, factor) =>
			make(...scaleEach(element, componentsOf(value), factor)),
	};

	register(descriptor, equals);

	return descriptor;
};
