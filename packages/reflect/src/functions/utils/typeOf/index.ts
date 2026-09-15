/**
 * The most primitive form a value can be reduced to at runtime.
 *
 * Every member splits a case the native `typeof` collapses: `typeof` answers
 * `'object'` for `null`, arrays, dates, maps and class instances alike, and
 * `'number'` for `NaN` as much as for an integer.
 *
 * Note that this describes the *runtime* shape of a value, not its declared
 * TypeScript type. Interfaces, type aliases, generic arguments and the module a
 * type was declared in are erased by the compiler and leave nothing behind to
 * inspect — see {@link TypeOf.lineage} for the closest runtime equivalent.
 */
export type TypeId =
	| 'null'
	| 'undefined'
	| 'boolean'
	| 'integer'
	| 'float'
	| 'nan'
	| 'infinity'
	| 'bigint'
	| 'string'
	| 'symbol'
	| 'array'
	| 'typed-array'
	| 'array-buffer'
	| 'data-view'
	| 'date'
	| 'regexp'
	| 'error'
	| 'map'
	| 'set'
	| 'weak-map'
	| 'weak-set'
	| 'weak-ref'
	| 'promise'
	| 'function'
	| 'async-function'
	| 'generator-function'
	| 'async-generator-function'
	| 'generator'
	| 'class'
	| 'arguments'
	| 'boxed-primitive'
	| 'plain-object'
	| 'null-prototype-object'
	| 'instance';

/**
 * Everything {@link typeOf} could establish about a value.
 *
 * @template T Type of the inspected value.
 */
export interface TypeOf {
	/**
	 * The most primitive form the value reduces to, usable as a discriminant in
	 * a `switch` or an `if`.
	 */
	readonly typeId: TypeId;

	/**
	 * Readable name of the concrete type: the class name for an instance, the
	 * function name for a callable, the built-in name for everything else.
	 *
	 * Anonymous callables report `'(anonymous)'`, and an object created with
	 * `Object.create(null)` reports `'(null prototype)'`.
	 */
	readonly name: string;

	/**
	 * Names of the prototype chain, from the closest ancestor to the root.
	 *
	 * This is as close as a runtime inspection can get to "where does this type
	 * come from": an instance of `Admin extends User` reports
	 * `['Admin', 'User', 'Object']`. It is a chain of constructors, never a
	 * module path — the compiler keeps no record of where a class was declared.
	 */
	readonly lineage: readonly string[];

	/** Whether the value is a primitive rather than an object or a callable. */
	readonly primitive: boolean;

	/** Whether the value is `null` or `undefined`. */
	readonly nullish: boolean;

	/** Whether the value can be traversed with `for...of`. */
	readonly iterable: boolean;

	/**
	 * The declared TypeScript type of the inspected expression, injected at
	 * build time by the transformer, or `null` when the project compiles
	 * without it.
	 *
	 * This is the only field describing the type as it was *written* rather
	 * than as it exists at runtime, and the only one that can name an interface
	 * or point at the file a type came from.
	 */
	readonly declared: DeclaredType | null;
}

/**
 * Kind of declaration a static type came from.
 *
 * Unlike {@link TypeId}, which describes the runtime shape of a value, this
 * describes how the type was written in the source — a distinction the compiler
 * knows and then throws away.
 */
export type DeclaredKind =
	| 'interface'
	| 'class'
	| 'type-alias'
	| 'enum'
	| 'union'
	| 'intersection'
	| 'literal'
	| 'primitive'
	| 'array'
	| 'tuple'
	| 'function'
	| 'object'
	| 'unknown';

/** Where a type was written, as the compiler saw it. */
export interface DeclarationSite {
	/** Path of the file holding the declaration, relative to the project. */
	readonly path: string;

	/** One based line of the declaration. */
	readonly line: number;

	/** One based column of the declaration. */
	readonly column: number;
}

/**
 * The declared TypeScript type behind a value, as the compiler knew it.
 *
 * Only present when the project compiles through the bundled transformer: the
 * information is injected into the call at build time, because nothing of it
 * survives into the emitted JavaScript on its own. Without the transformer the
 * field reads `null` and the rest of {@link TypeOf} keeps working.
 */
export interface DeclaredType {
	/** The type exactly as the compiler renders it, such as `string | number`. */
	readonly text: string;

	/** Name of the type when it has one, `null` for an anonymous shape. */
	readonly name: string | null;

	/** How the type was declared. */
	readonly kind: DeclaredKind;

	/** Where the type was declared, `null` for a built-in or anonymous type. */
	readonly site: DeclarationSite | null;
}

/** Identifiers whose values are primitives. */
const PRIMITIVE_IDS: ReadonlySet<TypeId> = new Set<TypeId>([
	'null',
	'undefined',
	'boolean',
	'integer',
	'float',
	'nan',
	'infinity',
	'bigint',
	'string',
	'symbol',
]);

/** Built-in tags of the typed arrays, which share a single identifier. */
const TYPED_ARRAY_TAGS: ReadonlySet<string> = new Set([
	'Int8Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'Int16Array',
	'Uint16Array',
	'Int32Array',
	'Uint32Array',
	'Float16Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
]);

/** Built-in tags of the boxed primitives. */
const BOXED_PRIMITIVE_TAGS: ReadonlySet<string> = new Set([
	'Number',
	'String',
	'Boolean',
	'Symbol',
	'BigInt',
]);

/** Identifiers resolved directly from the built-in tag of an object. */
const TAGGED_IDS: Readonly<Record<string, TypeId>> = {
	Array: 'array',
	ArrayBuffer: 'array-buffer',
	SharedArrayBuffer: 'array-buffer',
	DataView: 'data-view',
	Date: 'date',
	RegExp: 'regexp',
	Error: 'error',
	Map: 'map',
	Set: 'set',
	WeakMap: 'weak-map',
	WeakSet: 'weak-set',
	WeakRef: 'weak-ref',
	Promise: 'promise',
	Generator: 'generator',
	AsyncGenerator: 'generator',
	Arguments: 'arguments',
};

/** Name reported for a callable that carries no name of its own. */
export const ANONYMOUS_NAME = '(anonymous)';

/** Name reported for an object detached from every prototype. */
const NULL_PROTOTYPE_NAME = '(null prototype)';

/**
 * Reads the built-in tag of a value, such as `'Array'` or `'Date'`.
 *
 * `Object.prototype.toString` is the only inspection that survives realm
 * boundaries: an array coming from another frame or worker fails `instanceof
 * Array`, yet still reports the `'Array'` tag.
 *
 * @param value Value being inspected.
 * @returns The tag, without its `[object ...]` wrapper.
 */
const tagOf = (value: unknown): string =>
	Object.prototype.toString.call(value).slice(8, -1);

/**
 * Resolves the identifier of a callable.
 *
 * @param value Callable being inspected.
 * @returns The identifier of the callable.
 */
export const resolveCallableId = (value: () => unknown): TypeId => {
	// A class is a function at runtime, and only its source tells it apart.
	// `Function.prototype.toString` is required to return the original source
	// text, so the prefix is reliable wherever the code was not minified into
	// a plain function.
	if (/^\s*class[\s{]/.test(Function.prototype.toString.call(value))) {
		return 'class';
	}

	switch (tagOf(value)) {
		case 'AsyncFunction':
			return 'async-function';
		case 'GeneratorFunction':
			return 'generator-function';
		case 'AsyncGeneratorFunction':
			return 'async-generator-function';
		default:
			return 'function';
	}
};

/**
 * Resolves the identifier of an object.
 *
 * @param value Object being inspected.
 * @returns The identifier of the object.
 */
const resolveObjectId = (value: object): TypeId => {
	const tag: string = tagOf(value);
	const tagged: TypeId | undefined = TAGGED_IDS[tag];

	if (tagged !== undefined) return tagged;
	if (TYPED_ARRAY_TAGS.has(tag)) return 'typed-array';
	if (BOXED_PRIMITIVE_TAGS.has(tag)) return 'boxed-primitive';

	const prototype: object | null = Object.getPrototypeOf(value);

	if (prototype === null) return 'null-prototype-object';
	if (prototype === Object.prototype) return 'plain-object';

	return 'instance';
};

/**
 * Resolves the identifier of a number, which the native `typeof` reports as a
 * single type however different its values behave.
 *
 * @param value Number being inspected.
 * @returns The identifier of the number.
 */
const resolveNumberId = (value: number): TypeId => {
	if (Number.isNaN(value)) return 'nan';
	if (!Number.isFinite(value)) return 'infinity';

	return Number.isInteger(value) ? 'integer' : 'float';
};

/**
 * Resolves the most primitive form a value reduces to.
 *
 * @param value Value being inspected.
 * @returns The identifier of the value.
 */
const resolveTypeId = (value: unknown): TypeId => {
	if (value === null) return 'null';

	switch (typeof value) {
		case 'undefined':
			return 'undefined';
		case 'boolean':
			return 'boolean';
		case 'number':
			return resolveNumberId(value);
		case 'bigint':
			return 'bigint';
		case 'string':
			return 'string';
		case 'symbol':
			return 'symbol';
		case 'function':
			return resolveCallableId(value as () => unknown);
		default:
			return resolveObjectId(value as object);
	}
};

/**
 * Resolves the readable name of a value.
 *
 * @param value Value being inspected.
 * @param typeId Identifier already resolved for the value.
 * @returns The name of the concrete type.
 */
const resolveName = (value: unknown, typeId: TypeId): string => {
	if (typeId === 'null') return 'null';
	if (typeId === 'undefined') return 'undefined';
	if (typeId === 'null-prototype-object') return NULL_PROTOTYPE_NAME;

	if (typeof value === 'function') {
		return value.name.length > 0 ? value.name : ANONYMOUS_NAME;
	}

	const constructorName: unknown = (
		value as { constructor?: { name?: unknown } }
	)?.constructor?.name;

	if (typeof constructorName === 'string' && constructorName.length > 0) {
		return constructorName;
	}

	return tagOf(value);
};

/**
 * Walks the prototype chain of a value, collecting the name of each ancestor.
 *
 * @param value Value being inspected.
 * @returns The ancestors, from the closest one to the root.
 */
const resolveLineage = (value: unknown): readonly string[] => {
	if (value === null || value === undefined) return [];

	const lineage: string[] = [];

	// Boxing a primitive exposes the chain behind it — `1` reports
	// `['Number', 'Object']` — without altering the value itself.
	let prototype: object | null = Object.getPrototypeOf(Object(value));

	while (prototype !== null) {
		const constructorName: unknown = (
			prototype as { constructor?: { name?: unknown } }
		).constructor?.name;

		lineage.push(
			typeof constructorName === 'string' && constructorName.length > 0
				? constructorName
				: NULL_PROTOTYPE_NAME,
		);

		prototype = Object.getPrototypeOf(prototype);
	}

	return lineage;
};

/**
 * Tells whether a value can be traversed with `for...of`.
 *
 * @param value Value being inspected.
 * @returns `true` when the value implements the iteration protocol.
 */
const isIterable = (value: unknown): boolean => {
	if (value === null || value === undefined) return false;

	return (
		typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
		'function'
	);
};

/**
 * Inspects a value and reports everything about its type that survives into
 * runtime.
 *
 * Meant as a replacement for the native `typeof`, which answers with only eight
 * strings and collapses most of what a program actually needs to tell apart:
 *
 * ```ts
 * typeof null;            // 'object'
 * typeOf(null).typeId;    // 'null'
 *
 * typeof [1, 2];          // 'object'
 * typeOf([1, 2]).typeId;  // 'array'
 *
 * typeof NaN;             // 'number'
 * typeOf(NaN).typeId;     // 'nan'
 *
 * typeof new User();      // 'object'
 * typeOf(new User());     // { typeId: 'instance', name: 'User', ... }
 * ```
 *
 * The *declared* TypeScript type — the one that can name an interface or point
 * at the file a type came from — cannot be recovered by inspecting a value,
 * because the compiler erases it. It is reported in {@link TypeOf.declared}
 * instead, and only when the project compiles through the bundled transformer,
 * which injects it into the call at build time.
 *
 * @param value Value being inspected.
 * @param declared The declared type of the inspected expression. Never passed
 * by hand: the transformer appends it, and it stays `undefined` otherwise.
 * @returns The description of the value.
 */
export const typeOf = (value: unknown, declared?: DeclaredType): TypeOf => {
	const typeId: TypeId = resolveTypeId(value);

	return {
		typeId,
		name: resolveName(value, typeId),
		lineage: resolveLineage(value),
		primitive: PRIMITIVE_IDS.has(typeId),
		nullish: value === null || value === undefined,
		iterable: isIterable(value),
		declared: declared ?? null,
	};
};
