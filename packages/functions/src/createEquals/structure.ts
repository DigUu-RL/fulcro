import { isVariantPrototype } from '@/src/variant';

/**
 * How the values inside two objects are compared: the variant the comparison
 * belongs to, carrying what it has already seen.
 */
type Compare = (left: unknown, right: unknown) => boolean;

/**
 * Internal. How each kind of object that is defined by its contents is read,
 * once `createEquals` has found two distinct objects no rule claims. Kept apart
 * from the variant itself, which decides the order in which identity, rules and
 * contents are consulted: a new kind is added here without touching that
 * order.
 */

/**
 * Compares two values as `Set` and `Map` compare their keys: `NaN` equals
 * `NaN`, `0` equals `-0`, and anything else only itself.
 *
 * @param left First value.
 * @param right Second value.
 * @returns `true` when they are the same value.
 */
export const sameValueZero = (left: unknown, right: unknown): boolean => {
	return (
		left === right ||
		(typeof left === 'number' &&
			typeof right === 'number' &&
			Number.isNaN(left) &&
			Number.isNaN(right))
	);
};

/**
 * The own enumerable keys of an object, strings and symbols alike — what a
 * spread copies, which is what the data of a plain object is.
 *
 * @param value Object to read.
 * @returns Its keys.
 */
const enumerableKeys = (value: object): PropertyKey[] => {
	return Reflect.ownKeys(value).filter((key) => {
		return Object.prototype.propertyIsEnumerable.call(value, key);
	});
};

/**
 * @param left First object.
 * @param right Second object.
 * @param compare Comparison of the values under each key.
 * @returns `true` when both have the same keys, in any order, and equal values
 * under each.
 */
const compareRecords = (left: object, right: object, compare: Compare): boolean => {
	const keys: PropertyKey[] = enumerableKeys(left);

	if (keys.length !== enumerableKeys(right).length) return false;

	return keys.every((key) => {
		return (
			Object.prototype.propertyIsEnumerable.call(right, key) &&
			compare(
				(left as Record<PropertyKey, unknown>)[key],
				(right as Record<PropertyKey, unknown>)[key],
			)
		);
	});
};

/**
 * Index by index rather than through `every`, which skips a hole: a hole reads
 * as `undefined`, so `[, 1]` and `[undefined, 1]` are equal.
 *
 * @param left First array.
 * @param right Second array.
 * @param compare Comparison of the elements.
 * @returns `true` when both are as long and every element is equal.
 */
const compareArrays = (
	left: readonly unknown[],
	right: readonly unknown[],
	compare: Compare,
): boolean => {
	if (left.length !== right.length) return false;

	for (let index = 0; index < left.length; index++) {
		if (!compare(left[index], right[index])) return false;
	}

	return true;
};

/**
 * Each key of one map is looked up in the other rather than matched against
 * every key there: a key is found as the map itself finds it, by identity, so
 * the comparison stays linear. Matching keys by their contents would cost a
 * comparison per pair of keys.
 *
 * @param left First map.
 * @param right Second map.
 * @param compare Comparison of the values.
 * @returns `true` when both hold the same keys with equal values.
 */
const compareMaps = (
	left: ReadonlyMap<unknown, unknown>,
	right: ReadonlyMap<unknown, unknown>,
	compare: Compare,
): boolean => {
	if (left.size !== right.size) return false;

	for (const [key, value] of left) {
		const other: unknown = right.get(key);

		// `has` only settles an `undefined`, which `get` also returns for a key
		// that is not there.
		if (other === undefined && !right.has(key)) return false;
		if (!compare(value, other)) return false;
	}

	return true;
};

/**
 * Elements are looked up as the set itself finds them, by identity, for the
 * reason {@link compareMaps} gives.
 *
 * @param left First set.
 * @param right Second set.
 * @returns `true` when both hold the same elements.
 */
const compareSets = (left: ReadonlySet<unknown>, right: ReadonlySet<unknown>): boolean => {
	if (left.size !== right.size) return false;

	for (const item of left) {
		if (!right.has(item)) return false;
	}

	return true;
};

/**
 * @param left First run of bytes.
 * @param right Second run of bytes.
 * @returns `true` when both are as long and every byte is equal.
 */
const compareBytes = (left: Uint8Array, right: Uint8Array): boolean => {
	if (left.length !== right.length) return false;

	for (let index = 0; index < left.length; index++) {
		if (left[index] !== right[index]) return false;
	}

	return true;
};

/**
 * The bytes a view observes, and no others: a `DataView` over part of a buffer
 * is equal to another over the same bytes, wherever each buffer starts.
 *
 * @param view View to read.
 * @returns Its bytes.
 */
const bytesOf = (view: ArrayBufferView): Uint8Array => {
	return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
};

/**
 * Element by element, so a float array compares its numbers as numbers — two
 * `NaN`s are equal, and so are `0` and `-0` — rather than as the bytes behind
 * them.
 *
 * @param left First array.
 * @param right Second array, of the same kind.
 * @returns `true` when both are as long and every element is equal.
 */
const compareTypedArrays = (left: ArrayLike<unknown>, right: ArrayLike<unknown>): boolean => {
	if (left.length !== right.length) return false;

	for (let index = 0; index < left.length; index++) {
		if (!sameValueZero(left[index], right[index])) return false;
	}

	return true;
};

/**
 * Compares two distinct objects by their contents, when they are of a kind
 * defined by its contents.
 *
 * Objects of different prototypes are never equal. A plain object, an array,
 * a `Result` or an `Option`, a `Date`, a `Map`, a `Set`, an `ArrayBuffer`, a
 * `DataView` and a typed array are compared by what they hold. Any other
 * object is an identity type — a class may keep its state in private fields
 * nothing can read — so it equals only itself, and two distinct ones are
 * unequal.
 *
 * @param left First object.
 * @param right Second object.
 * @param compare Comparison of the values inside them.
 * @returns `true` when both are of one kind and hold equal contents.
 */
export const compareStructures = (left: object, right: object, compare: Compare): boolean => {
	const prototype: object | null = Object.getPrototypeOf(left) as object | null;

	if (prototype !== Object.getPrototypeOf(right)) return false;

	if (prototype === null || prototype === Object.prototype || isVariantPrototype(prototype)) {
		return compareRecords(left, right, compare);
	}

	if (Array.isArray(left) && Array.isArray(right)) return compareArrays(left, right, compare);
	if (left instanceof Date) return sameValueZero(left.getTime(), (right as Date).getTime());

	if (left instanceof Map) {
		return compareMaps(left as ReadonlyMap<unknown, unknown>, right as typeof left, compare);
	}

	if (left instanceof Set) return compareSets(left as ReadonlySet<unknown>, right as typeof left);

	if (left instanceof ArrayBuffer) {
		return compareBytes(new Uint8Array(left), new Uint8Array(right as ArrayBuffer));
	}

	if (left instanceof DataView) return compareBytes(bytesOf(left), bytesOf(right as DataView));

	if (ArrayBuffer.isView(left)) {
		return compareTypedArrays(
			left as unknown as ArrayLike<unknown>,
			right as unknown as ArrayLike<unknown>,
		);
	}

	return false;
};
