import { createError } from '@fulcro/errors';

/**
 * A value `constantOf` can hand back: what a literal can write down.
 */
export type Constant =
	| number
	| string
	| boolean
	| bigint
	| null
	| undefined
	| readonly Constant[]
	| { readonly [key: string]: Constant };

/**
 * Tells what keeps a value from being written as a literal, if anything.
 *
 * Shared by both halves of `constantOf`: the runtime refuses exactly what the
 * transformer refuses, so a call answers the same with and without it. Works
 * across realms, since the transformer evaluates in a context of its own whose
 * `Array` and `Object` are not this one's.
 *
 * A literal is a tree, so an object reached twice — shared, or a cycle — is
 * refused rather than silently copied into two.
 *
 * @param value Value produced.
 * @param seen Objects already reached, for the recursion.
 * @returns What is wrong with it, or `null` when it can be written.
 */
export const describeUnwritable = (
	value: unknown,
	seen: Set<object> = new Set(),
): string | null => {
	switch (typeof value) {
		case 'number':
		case 'string':
		case 'boolean':
		case 'bigint':
		case 'undefined':
			return null;
		case 'function':
			return 'a function';
		case 'symbol':
			return 'a symbol';
	}

	if (value === null) return null;

	const object = value as object;

	if (seen.has(object)) return 'an object reached twice';

	seen.add(object);

	if (Array.isArray(object)) {
		for (let index = 0; index < object.length; index++) {
			if (!Object.hasOwn(object, index)) return 'an array with holes';

			const inner: string | null = describeUnwritable(object[index], seen);

			if (inner !== null) return inner;
		}

		return Object.keys(object).length === object.length
			? null
			: 'an array with properties besides its elements';
	}

	const prototype: object | null = Object.getPrototypeOf(object);

	// A plain object's prototype is its realm's `Object.prototype`, whose own
	// prototype is null — whichever realm made it.
	if (prototype !== null && Object.getPrototypeOf(prototype) !== null) {
		const name: unknown = (prototype as { constructor?: { name?: unknown } })
			.constructor?.name;

		return typeof name === 'string' && name !== ''
			? `an instance of ${name}`
			: 'an object that is not plain';
	}

	if (Object.getOwnPropertySymbols(object).length > 0) {
		return 'an object with symbol keys';
	}

	for (const [key, descriptor] of Object.entries(
		Object.getOwnPropertyDescriptors(object),
	)) {
		if (!('value' in descriptor)) return `an object whose '${key}' is a getter`;

		const inner: string | null = describeUnwritable(descriptor.value, seen);

		if (inner !== null) return inner;
	}

	return null;
};

/**
 * Freezes a writable value and everything in it.
 *
 * @param value A value {@link describeUnwritable} accepted.
 * @returns The same value, frozen at every level.
 */
const freezeDeeply = <T>(value: T): T => {
	if (typeof value === 'object' && value !== null) {
		for (const inner of Object.values(value)) freezeDeeply(inner);

		Object.freeze(value);
	}

	return value;
};

/**
 * Describes a value for an error message.
 *
 * @param value Value being reported.
 * @returns Its kind.
 */
const describeKind = (value: unknown): string =>
	value === null ? 'null' : typeof value;

/**
 * A value computed once, at compile time, and written into the output as a
 * literal.
 *
 * ```ts
 * const CRC_TABLE = constantOf(() =>
 * 	Array.from({ length: 256 }, (_, byte) => {
 * 		let crc = byte;
 *
 * 		for (let bit = 0; bit < 8; bit++) {
 * 			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
 * 		}
 *
 * 		return crc >>> 0;
 * 	}),
 * );
 * // emitted: const CRC_TABLE = Object.freeze([0, 1996959894, …]);
 * ```
 *
 * Plain TypeScript as written: `tsc`, an editor and a linter read the call as
 * a call. With the `@fulcro/reflect` transformer, the function runs while the
 * program compiles, in a context of its own, and the call is replaced by what
 * it returned — so it costs nothing at runtime. Without it, the call runs the
 * function here, and the answer is the same.
 *
 * The transformer only evaluates what it can prove constant: everything the
 * function reads is a `const`, a function or a built-in whose source the
 * compiler can see — `Math`, `Array`, `Number` and their like, but no
 * `Math.random` and no `Date`. Anything else — a parameter, a `let`, a value
 * only declared in a `.d.ts` — fails the build, naming the call and the name
 * it could not prove; it is never quietly left to the runtime.
 *
 * @template T Type of the value.
 * @param compute Function computing the value, with no parameters.
 * @returns The value, frozen at every level.
 * @throws {TypeError} When `compute` is not a function, or returns something a
 * literal cannot write — a function, a class instance, an object reached
 * twice.
 */
export const constantOf = <T extends Constant>(compute: () => T): T => {
	if (typeof compute !== 'function') {
		throw createError('FULCRO4014', describeKind(compute));
	}

	const value: T = compute();
	const unwritable: string | null = describeUnwritable(value);

	if (unwritable !== null) {
		throw createError('FULCRO4011', 'constantOf(…)', unwritable);
	}

	return freezeDeeply(value);
};
