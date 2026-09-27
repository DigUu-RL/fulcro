import { createError, prefixError } from '@fulcro/errors';

import type { ElementType } from '@/element';
import { registerRepeatedCodec } from '@/struct/codec';

/**
 * Machinery shared by the types whose values are a few named components of one
 * element type: `Fraction` (`numerator`, `denominator`), `ComplexNumber`
 * (`real`, `imaginary`) and `Quaternion` (`w`, `x`, `y`, `z`).
 *
 * Internal. A value is a frozen plain object with exactly its components, as a
 * struct's value is, and it is stored as its components end to end, in the
 * order they are named here.
 */

/** What the machinery offers a type built on it. */
export interface ComponentRecord<T, TValue> {
	/**
	 * Makes a value from its components, in the declared order.
	 *
	 * @param components One per component.
	 * @returns The value, frozen.
	 */
	readonly make: (...components: T[]) => TValue;

	/**
	 * Converts an object of components handed to `from`.
	 *
	 * @param operation Operation being performed.
	 * @param source Value handed in.
	 * @returns The components in the declared order, or `null` when the source
	 * is not a plain object and the type converts it some other way.
	 * @throws {TypeError} When a component is missing or not one of the type's.
	 */
	readonly convert: (operation: string, source: unknown) => T[] | null;

	/**
	 * Tells whether a value has the shape of one of this type's values: frozen,
	 * with exactly its components, each of the element type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it has.
	 */
	readonly isRecord: (value: unknown) => value is TValue;

	/**
	 * Registers the codec of a descriptor, when the element type has a fixed
	 * layout.
	 *
	 * @param descriptor The descriptor.
	 * @param equals How the type compares two values.
	 */
	readonly register: (
		descriptor: object,
		equals: (left: TValue, right: TValue) => boolean,
	) => void;
}

/**
 * Tells whether a value is a plain object: a literal, not an instance of a
 * class — so a `Decimal` handed to `from` is a number to convert, not a record.
 *
 * @param value Value to inspect.
 * @returns `true` when it is.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
	if (typeof value !== 'object' || value === null) return false;

	const prototype: unknown = Object.getPrototypeOf(value);

	return prototype === Object.prototype || prototype === null;
};

/**
 * Builds the machinery for one type.
 *
 * @param keys Names of the components, in the order they are stored.
 * @param element Element type of every component.
 * @param elementDescriptor What the element type was declared with, whose
 * codec the type's own is built from.
 * @returns The machinery.
 */
export const createComponentRecord = <T, TValue>(
	keys: readonly string[],
	element: ElementType<T>,
	elementDescriptor: unknown,
): ComponentRecord<T, TValue> => {
	const make = (...components: T[]): TValue => {
		const value: Record<string, T> = {};

		for (let index = 0; index < keys.length; index++) {
			value[keys[index]] = components[index];
		}

		return Object.freeze(value) as TValue;
	};

	const convert = (operation: string, source: unknown): T[] | null => {
		if (!isPlainObject(source)) return null;

		for (const key of Object.keys(source)) {
			if (!keys.includes(key)) {
				throw createError('FULCRO6020', operation, key, keys.join(', '));
			}
		}

		return keys.map((key) => {
			if (!Object.hasOwn(source, key)) {
				throw createError('FULCRO6021', operation, key);
			}

			try {
				return element.from(source[key] as number);
			} catch (error) {
				throw prefixError(error, `${operation}: field '${key}'`);
			}
		});
	};

	const isRecord = (value: unknown): value is TValue =>
		isPlainObject(value) &&
		Object.isFrozen(value) &&
		Object.keys(value).length === keys.length &&
		keys.every((key) => Object.hasOwn(value, key) && element.is(value[key]));

	const register = (
		descriptor: object,
		equals: (left: TValue, right: TValue) => boolean,
	): void =>
		registerRepeatedCodec(
			descriptor,
			elementDescriptor,
			keys.length,
			(components) => make(...(components as T[])),
			(value) => keys.map((key) => (value as Record<string, unknown>)[key]),
			(left, right) => equals(left as TValue, right as TValue),
		);

	return { make, convert, isRecord, register };
};
