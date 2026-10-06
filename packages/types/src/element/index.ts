import { createError } from '@fulcro/errors';

import { Decimal } from '@/decimal';
import type { Layout } from '@/layout';

/**
 * What the mathematics types ask of the type their components are made of.
 *
 * Internal. `Matrix`, `Vector`, `ComplexNumber` and `Quaternion` are generic
 * over the type of their components, and all they need from it is this: a way
 * in from a number, a way to recognise one, and the arithmetic of a ring with
 * division. Every numeric type of this package has it, and so does each of
 * those four — which is what makes a matrix of complex numbers a matrix like
 * any other.
 *
 * `Decimal` has the same operations as methods on its values rather than on
 * its descriptor, so it reaches this contract through {@link elementOf}.
 *
 * @template T Type of the components.
 */
export interface ElementType<T> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/**
	 * Converts a number into the type. Zero and one are what a matrix's
	 * identity and a quaternion's conjugate are built from.
	 *
	 * @param value Number to convert.
	 * @returns The value, as this type.
	 */
	from(value: number): T;

	/**
	 * Tells whether a value already is of this type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is T;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The sum.
	 */
	add(left: T, right: T): T;

	/**
	 * @param left Value subtracted from.
	 * @param right Value subtracted.
	 * @returns The difference.
	 */
	subtract(left: T, right: T): T;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The product.
	 */
	multiply(left: T, right: T): T;

	/**
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The quotient.
	 */
	divide(left: T, right: T): T;

	/**
	 * @param value Value negated.
	 * @returns The negation.
	 */
	negate(value: T): T;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when they are equal.
	 */
	equals(left: T, right: T): boolean;
}

/**
 * {@link ElementType} with its component type left open, as a constraint a
 * descriptor of any component type satisfies. Written with method syntax, whose
 * parameters TypeScript compares in both directions, so `never` accepts the
 * parameters of every descriptor.
 */
interface AnyElementType {
	readonly name: string;
	from(value: number): unknown;
	is(value: unknown): boolean;
	add(left: never, right: never): unknown;
	subtract(left: never, right: never): unknown;
	multiply(left: never, right: never): unknown;
	divide(left: never, right: never): unknown;
	negate(value: never): unknown;
	equals(left: never, right: never): boolean;
}

/**
 * What a mathematics type accepts as the type of its components: a descriptor
 * with the operations of {@link ElementType}, or `Decimal`.
 */
export type ElementDescriptor = AnyElementType | typeof Decimal;

/**
 * The type of the values a descriptor recognises.
 *
 * @template TDescriptor Descriptor of the components.
 */
export type ValueOf<TDescriptor> = TDescriptor extends {
	is(value: unknown): value is infer T;
}
	? T
	: never;

/**
 * What a descriptor's `from` accepts.
 *
 * @template TDescriptor Descriptor of the components.
 */
export type SourceOf<TDescriptor> = TDescriptor extends {
	from(value: infer TSource): unknown;
}
	? TSource
	: never;

/**
 * The layout of `N` components of a type laid end to end, with the alignment
 * of one; nothing when the component type declares no layout, as `BigInteger`
 * does not.
 *
 * No padding is ever needed between them: the size of every type with a layout
 * is a multiple of its alignment.
 *
 * @template T Type of the components.
 * @template TSize Size of `N` components, computed by the caller from the size
 * of one.
 */
export type RepeatedLayout<T, TSize extends number> = [T] extends [
	Layout<number, infer TAlignment>,
]
	? Layout<TSize, TAlignment>
	: unknown;

/**
 * Size of one component, or `0` when it declares no layout — a value the
 * caller only uses inside {@link RepeatedLayout}, which then discards it.
 *
 * @template T Type of the components.
 */
export type ElementSize<T> = [T] extends [Layout<infer TSize, number>]
	? TSize
	: 0;

/**
 * `Decimal`, seen through {@link ElementType}: its operations are methods of
 * its values, rounding half to even as they do by default.
 */
const decimalElement: ElementType<Decimal> = {
	name: 'Decimal',
	from: (value) => Decimal.from(value),
	is: (value): value is Decimal => Decimal.is(value),
	add: (left, right) => left.add(right),
	subtract: (left, right) => left.subtract(right),
	multiply: (left, right) => left.multiply(right),
	divide: (left, right) => left.divide(right),
	negate: (value) => value.negate(),
	equals: (left, right) => left.equals(right),
};

/** The operations {@link ElementType} names, checked on a descriptor. */
const OPERATIONS: readonly (keyof ElementType<unknown>)[] = [
	'from',
	'is',
	'add',
	'subtract',
	'multiply',
	'divide',
	'negate',
	'equals',
];

/**
 * Describes a value for an error message.
 *
 * @param value Value being reported.
 * @returns Its kind.
 */
export const describeKind = (value: unknown): string =>
	value === null ? 'null' : typeof value;

/**
 * How a type built over an element type reads in an error message:
 * `Matrix<SinglePrecisionFloat, 3, 4>`, `ComplexNumber<Decimal>`.
 *
 * @param family Name of the family, `Matrix` or `ComplexNumber`.
 * @param element Name of the element type.
 * @param dimensions Further type arguments, when the family has any.
 * @returns The name.
 */
export const describeType = (
	family: string,
	element: string,
	...dimensions: readonly number[]
): string => `${family}<${[element, ...dimensions].join(', ')}>`;

/**
 * The operations of a component type, whatever form its descriptor takes.
 *
 * @param descriptor What a mathematics type was declared with.
 * @param operation Operation declaring it, for the error message.
 * @returns The descriptor itself, or `Decimal` seen through the contract.
 * @throws {TypeError} When the descriptor lacks one of the operations.
 */
export const elementOf = <T>(
	descriptor: unknown,
	operation: string,
): ElementType<T> => {
	if (descriptor === Decimal) return decimalElement as ElementType<T>;

	if (
		(typeof descriptor !== 'object' && typeof descriptor !== 'function') ||
		descriptor === null ||
		typeof (descriptor as { name?: unknown }).name !== 'string' ||
		OPERATIONS.some(
			(name) =>
				typeof (descriptor as Record<string, unknown>)[name] !== 'function',
		)
	) {
		throw createError('FULCRO6033', {
			operation,
			received: describeKind(descriptor),
		});
	}

	return descriptor as ElementType<T>;
};
