/** Matches property names made exclusively of digits, such as `"0"` or `"42"`. */
const INDEX_KEY_PATTERN = /^\d+$/;

/** Character code of `"0"`, the lower bound of the digits. */
const DIGIT_ZERO_CODE = 48;

/** Character code of `"9"`, the upper bound of the digits. */
const DIGIT_NINE_CODE = 57;

/**
 * Narrows a value to a length aware source, allowing counting operations to run
 * in `O(1)` for arrays, strings and other array like sources.
 *
 * @param source Value being inspected.
 * @returns `true` when `source` exposes a numeric `length` property.
 */
export const targetHasLength = (
	source: unknown,
): source is { readonly length: number } => {
	return (
		typeof source === 'object' &&
		source !== null &&
		'length' in source &&
		typeof (source as { length: unknown }).length === 'number'
	);
};

/**
 * Narrows a value to a size aware source, covering the collections of the
 * standard library that expose `size` instead of `length`, such as `Set` and
 * `Map`.
 *
 * @param source Value being inspected.
 * @returns `true` when `source` exposes a numeric `size` property.
 */
export const targetHasSize = (
	source: unknown,
): source is { readonly size: number } => {
	return (
		typeof source === 'object' &&
		source !== null &&
		'size' in source &&
		typeof (source as { size: unknown }).size === 'number'
	);
};

/**
 * Reads the amount of elements of a source without traversing it.
 *
 * Only sources declaring their own cardinality can answer: arrays and other
 * array like values through `length`, `Set` and `Map` through `size`. Anything
 * else — a generator above all — has no cardinality until it is drained, and is
 * reported as unknown rather than counted.
 *
 * @param source Value being inspected.
 * @returns The amount of elements, or `null` when the source cannot tell.
 */
export const resolveDeclaredCount = (source: unknown): number | null => {
	if (targetHasLength(source)) return source.length;
	if (targetHasSize(source)) return source.size;

	return null;
};

/**
 * Tells whether a property name read by a `Proxy` represents a positional
 * index rather than a member of the collection.
 *
 * Only non negative integers written in their canonical form are accepted, so
 * names such as `"length"`, `"-1"`, `"1.5"`, `"Infinity"` and `""` are treated
 * as regular members.
 *
 * Sits on the hottest path of the library: the `Proxy` calls it on every single
 * property read, method names and `Symbol.iterator` included. The first
 * character is therefore checked by hand, so that everything which is not an
 * index — the overwhelming majority of the reads — is rejected without ever
 * entering the regular expression.
 *
 * @param property Property name being read.
 * @returns `true` when the property name is a positional index.
 */
export const isIndexKey = (property: string | symbol): property is string => {
	if (typeof property !== 'string') return false;

	const firstCharacterCode: number = property.charCodeAt(0);

	if (
		firstCharacterCode < DIGIT_ZERO_CODE ||
		firstCharacterCode > DIGIT_NINE_CODE
	)
		return false;

	return INDEX_KEY_PATTERN.test(property);
};
