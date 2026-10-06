import { createError } from '@fulcro/errors';

import { BigInteger } from '@/bigInteger';
import { createComponentRecord } from '@/components';
import {
	describeKind,
	describeType,
	elementOf,
	type ElementSize,
	type RepeatedLayout,
	type SourceOf,
	type ValueOf,
} from '@/element';
import type { IntegerType } from '@/integer';
import type { NumericType } from '@/numericType';
import type { Multiply } from '@/struct/arithmetic';

/**
 * An exact rational number: a numerator over a denominator, both of the
 * integer type `T`.
 *
 * ```ts
 * const Ratio = Fraction(SignedInteger(32));
 * const third = Ratio.from({ numerator: 1, denominator: 3 });
 *
 * Ratio.add(third, third); // { numerator: 2, denominator: 3 }
 * Ratio.multiply(third, Ratio.from(3)); // { numerator: 1, denominator: 1 }
 * ```
 *
 * Always in lowest terms, with a positive denominator, so two fractions are
 * equal exactly when their parts are and `2/4` is never seen: it is `1/2`.
 * The value is a frozen object with exactly `numerator` and `denominator`.
 * When `T` declares a layout, so does the fraction: the numerator, then the
 * denominator.
 *
 * @template T Integer type of the numerator and the denominator.
 */
export type Fraction<T> = {
	/** The numerator, carrying the sign. */
	readonly numerator: T;

	/** The denominator, always positive. */
	readonly denominator: T;
} & RepeatedLayout<T, Multiply<2, ElementSize<T>>>;

/**
 * The descriptor of a fraction type: the numeric type contract, over exact
 * rationals.
 *
 * Every operation is exact. What can fail is the integer type underneath: an
 * intermediate product outside its range throws its `RangeError`, even where
 * the reduced result would fit. Over `BigInteger` nothing overflows.
 *
 * `power` takes a whole exponent — a fraction whose denominator is 1 — since a
 * fractional power is rarely rational; a negative one inverts the base.
 *
 * @template T Integer type of the numerator and the denominator.
 * @template TSource What the integer type's `from` accepts.
 */
export type FractionType<T, TSource = number | bigint> = NumericType<
	Fraction<T>,
	TSource | { readonly numerator: TSource; readonly denominator: TSource }
>;

/** The integer types a fraction can be declared over. */
type IntegerDescriptor = IntegerType<unknown> | typeof BigInteger;

/** The parts, in the order they are stored. */
const PARTS: readonly string[] = ['numerator', 'denominator'];

/**
 * Tells whether a descriptor is one of the integer types.
 *
 * @param descriptor Value to inspect.
 * @returns `true` for `BigInteger` and for a fixed-width integer type.
 */
const isIntegerDescriptor = (descriptor: unknown): boolean =>
	descriptor === BigInteger ||
	(typeof descriptor === 'object' &&
		descriptor !== null &&
		typeof (descriptor as { signed?: unknown }).signed === 'boolean' &&
		typeof (descriptor as { width?: unknown }).width === 'number');

/**
 * Declares a fraction type over an integer type.
 *
 * ```ts
 * const Ratio = Fraction(BigInteger);
 *
 * Ratio.from(4); // { numerator: 4n, denominator: 1n }
 * Ratio.from({ numerator: 6, denominator: -4 }); // { numerator: -3n, denominator: 2n }
 * Ratio.lessThan(Ratio.from({ numerator: 1, denominator: 3 }), Ratio.from(0)); // false
 * ```
 *
 * @template TElement Descriptor of the integer type.
 * @param element `SignedInteger(n)`, `UnsignedInteger(n)` or `BigInteger`.
 * @returns The descriptor of the fraction type.
 * @throws {TypeError} When the type is not an integer type.
 */
export const Fraction = <TElement extends IntegerDescriptor>(
	element: TElement,
): FractionType<ValueOf<TElement>, SourceOf<TElement>> => {
	type T = ValueOf<TElement>;
	type Value = Fraction<T>;

	if (!isIntegerDescriptor(element)) {
		throw createError('FULCRO6041', {
			operation: 'Fraction',
			received: describeKind(element),
		});
	}

	const integer = element as unknown as NumericType<T, number>;

	elementOf<T>(integer, 'Fraction');

	const name: string = describeType('Fraction', integer.name);
	const { make, convert, isRecord, register } = createComponentRecord<T, Value>(
		PARTS,
		integer,
		element,
	);

	const zero: T = integer.from(0);
	const one: T = integer.from(1);

	/**
	 * @param value An integer.
	 * @returns Its magnitude.
	 */
	const absolute = (value: T): T =>
		integer.lessThan(value, zero) ? integer.negate(value) : value;

	/**
	 * The greatest common divisor, by Euclid's algorithm: a number of steps
	 * that grows with the number of digits, never with the values.
	 *
	 * @param left An integer.
	 * @param right An integer.
	 * @returns Their greatest common divisor, never negative; zero only for two
	 * zeros.
	 */
	const greatestCommonDivisor = (left: T, right: T): T => {
		let a: T = absolute(left);
		let b: T = absolute(right);

		while (!integer.equals(b, zero)) {
			const remainder: T = integer.remainder(a, b);

			a = b;
			b = remainder;
		}

		return a;
	};

	/**
	 * Makes a fraction in lowest terms with a positive denominator.
	 *
	 * @param operation Operation being performed, for the error message.
	 * @param numerator Numerator, in any terms.
	 * @param denominator Denominator, in any terms and of either sign.
	 * @returns The fraction.
	 * @throws {RangeError} When the denominator is zero.
	 */
	const reduce = (operation: string, numerator: T, denominator: T): Value => {
		if (integer.equals(denominator, zero)) {
			throw createError('FULCRO6001', { operation });
		}

		let top: T = numerator;
		let bottom: T = denominator;

		if (integer.lessThan(bottom, zero)) {
			top = integer.negate(top);
			bottom = integer.negate(bottom);
		}

		const divisor: T = greatestCommonDivisor(top, bottom);

		if (!integer.equals(divisor, one)) {
			top = integer.divide(top, divisor);
			bottom = integer.divide(bottom, divisor);
		}

		return make(top, bottom);
	};

	/**
	 * `left × right` of two fractions in lowest terms, with the common factors
	 * cancelled across before multiplying, so the intermediate products stay as
	 * small as the result allows.
	 *
	 * @param operation Operation being performed.
	 * @param left First operand.
	 * @param leftDenominator Its denominator.
	 * @param right Second operand's numerator.
	 * @param rightDenominator Its denominator.
	 * @returns The product.
	 */
	const product = (
		operation: string,
		left: T,
		leftDenominator: T,
		right: T,
		rightDenominator: T,
	): Value => {
		const first: T = greatestCommonDivisor(left, rightDenominator);
		const second: T = greatestCommonDivisor(right, leftDenominator);
		const over = (value: T, divisor: T): T =>
			integer.equals(divisor, zero) || integer.equals(divisor, one)
				? value
				: integer.divide(value, divisor);

		return reduce(
			operation,
			integer.multiply(over(left, first), over(right, second)),
			integer.multiply(
				over(leftDenominator, second),
				over(rightDenominator, first),
			),
		);
	};

	/**
	 * `left ± right`, over the least common denominator.
	 *
	 * @param operation Operation being performed.
	 * @param left First operand.
	 * @param right Second operand.
	 * @param combine Addition or subtraction of the scaled numerators.
	 * @returns The result.
	 */
	const sum = (
		operation: string,
		left: Value,
		right: Value,
		combine: (left: T, right: T) => T,
	): Value => {
		const divisor: T = greatestCommonDivisor(
			left.denominator,
			right.denominator,
		);
		const leftScale: T = integer.divide(right.denominator, divisor);
		const rightScale: T = integer.divide(left.denominator, divisor);

		return reduce(
			operation,
			combine(
				integer.multiply(left.numerator, leftScale),
				integer.multiply(right.numerator, rightScale),
			),
			integer.multiply(left.denominator, leftScale),
		);
	};

	/**
	 * `left.numerator × right.denominator` against the other cross product: the
	 * order of two fractions, their denominators being positive.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The two cross products.
	 */
	const cross = (left: Value, right: Value): [T, T] => [
		integer.multiply(left.numerator, right.denominator),
		integer.multiply(right.numerator, left.denominator),
	];

	const descriptor: FractionType<T, SourceOf<TElement>> = {
		name,

		from: (value) => {
			const parts: T[] | null = convert(`${name}.from`, value);

			if (parts !== null) return reduce(`${name}.from`, parts[0], parts[1]);

			return make(integer.from(value as number), one);
		},

		is: (value): value is Value =>
			isRecord(value) &&
			integer.lessThan(zero, value.denominator) &&
			integer.equals(
				greatestCommonDivisor(value.numerator, value.denominator),
				one,
			),

		add: (left, right) =>
			sum(`${name}.add`, left, right, (a, b) => integer.add(a, b)),

		subtract: (left, right) =>
			sum(`${name}.subtract`, left, right, (a, b) => integer.subtract(a, b)),

		multiply: (left, right) =>
			product(
				`${name}.multiply`,
				left.numerator,
				left.denominator,
				right.numerator,
				right.denominator,
			),

		divide: (left, right) => {
			if (integer.equals(right.numerator, zero)) {
				throw createError('FULCRO6001', { operation: `${name}.divide` });
			}

			return product(
				`${name}.divide`,
				left.numerator,
				left.denominator,
				right.denominator,
				right.numerator,
			);
		},

		// left − right × trunc(left / right): the sign of the dividend, as `%`.
		remainder: (left, right) => {
			if (integer.equals(right.numerator, zero)) {
				throw createError('FULCRO6001', { operation: `${name}.remainder` });
			}

			const [scaledLeft, scaledRight] = cross(left, right);
			const quotient: T = integer.divide(scaledLeft, scaledRight);

			return reduce(
				`${name}.remainder`,
				integer.subtract(scaledLeft, integer.multiply(quotient, scaledRight)),
				integer.multiply(left.denominator, right.denominator),
			);
		},

		power: (base, exponent) => {
			if (!integer.equals(exponent.denominator, one)) {
				throw createError('FULCRO6042', {
					operation: `${name}.power`,
					name,
					received: `${String(exponent.numerator)}/${String(exponent.denominator)}`,
				});
			}

			if (!integer.lessThan(exponent.numerator, zero)) {
				return make(
					integer.power(base.numerator, exponent.numerator),
					integer.power(base.denominator, exponent.numerator),
				);
			}

			const magnitude: T = integer.negate(exponent.numerator);

			return reduce(
				`${name}.power`,
				integer.power(base.denominator, magnitude),
				integer.power(base.numerator, magnitude),
			);
		},

		// Already in lowest terms: negating the numerator changes no common
		// factor, and neither does adding or taking away the denominator.
		negate: (value) => make(integer.negate(value.numerator), value.denominator),

		increment: (value) =>
			make(integer.add(value.numerator, value.denominator), value.denominator),

		decrement: (value) =>
			make(
				integer.subtract(value.numerator, value.denominator),
				value.denominator,
			),

		equals: (left, right) =>
			integer.equals(left.numerator, right.numerator) &&
			integer.equals(left.denominator, right.denominator),

		lessThan: (left, right) => integer.lessThan(...cross(left, right)),
		lessThanOrEqual: (left, right) =>
			integer.lessThanOrEqual(...cross(left, right)),
		greaterThan: (left, right) => integer.greaterThan(...cross(left, right)),
		greaterThanOrEqual: (left, right) =>
			integer.greaterThanOrEqual(...cross(left, right)),
	};

	register(descriptor, descriptor.equals);

	return descriptor;
};
