import typescript from 'typescript';

/**
 * Reading a type into the facts the describing utilities report.
 *
 * `keysOf`, `typeOf<T>()` and `pathsOf` all ask the compiler the same kind of
 * question — what does this type declare, and what can it be walked to — so
 * they read it here once rather than three times with three chances to
 * disagree.
 *
 * Nothing in this module builds a node. It answers in plain data, and the
 * rewriters turn that into literals.
 */

/** How deep a walk descends before reporting the path it stopped at. */
const MAX_DEPTH = 10;

/** Classes reported as a leaf rather than walked into. */
const GLOBAL_CLASSES = new Set([
	'Date',
	'RegExp',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Promise',
	'Error',
	'ArrayBuffer',
	'DataView',
]);

/** Flags whose types are leaves: there is nothing inside them worth a path. */
const LEAF_FLAGS =
	typescript.TypeFlags.StringLike |
	typescript.TypeFlags.NumberLike |
	typescript.TypeFlags.BooleanLike |
	typescript.TypeFlags.BigIntLike |
	typescript.TypeFlags.ESSymbolLike |
	typescript.TypeFlags.Null |
	typescript.TypeFlags.Undefined |
	typescript.TypeFlags.Void |
	typescript.TypeFlags.Any |
	typescript.TypeFlags.Unknown |
	typescript.TypeFlags.Never;

/** One member a type declares. */
export interface Member {
	/** Name of the member. */
	readonly name: string;

	/** Its type, rendered. */
	readonly type: string;

	/** Whether it may be absent. */
	readonly optional: boolean;

	/** Whether it is declared `readonly`. */
	readonly readonly: boolean;
}

/** One leaf a type can be walked to. */
export interface Path {
	/** The path, dotted, with `[]` for the elements of an array. */
	readonly path: string;

	/** The type at the end of it, rendered. */
	readonly type: string;

	/** Whether every step along the way is present. */
	readonly optional: boolean;
}

/**
 * Tells whether a type is one this stops at rather than descends into.
 *
 * **The rule the whole walk rests on.** Without it, a `string` property yields
 * the entire `String.prototype` — `customer.email.trimLeft` is a real property
 * path and nonsense as a data path.
 *
 * @param type Type being classified.
 * @returns `true` when the type is a leaf.
 */
const isLeaf = (type: typescript.Type): boolean =>
	(type.flags & LEAF_FLAGS) !== 0;

/**
 * Tells whether a type is a class this reports by name.
 *
 * `Date` is a leaf for the same reason a `string` is: nobody wants the fifty
 * methods a date carries listed as paths.
 *
 * @param type Type being classified.
 * @returns `true` when the type should be reported rather than walked.
 */
const isOpaqueClass = (type: typescript.Type): boolean => {
	const symbol: typescript.Symbol | undefined = type.getSymbol();

	if (symbol === undefined) return false;

	return (
		(symbol.flags & typescript.SymbolFlags.Class) !== 0 ||
		GLOBAL_CLASSES.has(symbol.getName())
	);
};

/**
 * Drops `undefined` from a union, and says whether it was there.
 *
 * @param type Type being inspected.
 * @returns The remaining branches and whether one of them was `undefined`.
 */
const withoutUndefined = (
	type: typescript.Type,
): {
	readonly rest: readonly typescript.Type[];
	readonly optional: boolean;
} => {
	if (!type.isUnion()) return { rest: [type], optional: false };

	const rest: typescript.Type[] = type.types.filter(
		(member) => (member.flags & typescript.TypeFlags.Undefined) === 0,
	);

	return { rest, optional: rest.length !== type.types.length };
};

/**
 * Tells whether a member name is one that can be reported.
 *
 * The compiler spells a symbol-keyed member `__@name@id`, which is not a name
 * any source can write and not a key anyone can look up.
 *
 * @param name Name being checked.
 * @returns `true` when the name is usable.
 */
const isReportable = (name: string): boolean => !name.startsWith('__@');

/**
 * Lists the keys a type declares.
 *
 * @param type Type being read.
 * @returns The names, in declaration order, or `null` when the type declares
 * none — a primitive, a union, an array.
 */
export const keysOfType = (type: typescript.Type): readonly string[] | null => {
	if (isLeaf(type) || type.isUnion() || isOpaqueClass(type)) return null;

	const names: string[] = type
		.getProperties()
		.map((property) => property.getName())
		.filter(isReportable);

	return names.length === 0 ? null : names;
};

/**
 * Lists the members a type declares, with their types.
 *
 * @param type Type being read.
 * @param checker Checker of the program being compiled.
 * @param at Node the lookups happen from.
 * @returns The members, in declaration order.
 */
export const membersOfType = (
	type: typescript.Type,
	checker: typescript.TypeChecker,
	at: typescript.Node,
): readonly Member[] => {
	if (isLeaf(type) || type.isUnion()) return [];

	return type
		.getProperties()
		.filter((property) => isReportable(property.getName()))
		.map((property) => {
			const declared: typescript.Type = checker.getTypeOfSymbolAtLocation(
				property,
				at,
			);

			return {
				name: property.getName(),
				type: checker.typeToString(declared),
				optional: (property.flags & typescript.SymbolFlags.Optional) !== 0,
				readonly: (property.declarations ?? []).some(
					(declaration) =>
						(typescript.getCombinedModifierFlags(declaration) &
							typescript.ModifierFlags.Readonly) !==
						0,
				),
			};
		});
};

/**
 * Walks a type to every leaf it can reach.
 *
 * @param type Type being walked.
 * @param checker Checker of the program being compiled.
 * @param at Node the lookups happen from.
 * @returns The leaves, or `null` when the type has none to walk to.
 */
export const pathsOfType = (
	type: typescript.Type,
	checker: typescript.TypeChecker,
	at: typescript.Node,
): readonly Path[] | null => {
	const found: Path[] = [];

	const walk = (
		current: typescript.Type,
		prefix: string,
		optional: boolean,
		open: ReadonlySet<typescript.Type>,
		depth: number,
	): void => {
		const { rest, optional: nullable } = withoutUndefined(current);
		const soFar: boolean = optional || nullable;

		// A union of leaves is a leaf and reports the union. A union with a shape
		// in it is reported without being descended: there is no single path to
		// promise when what is there depends on which branch a value took.
		if (rest.length > 1) {
			found.push({
				path: prefix,
				type: checker.typeToString(current),
				optional: soFar,
			});
			return;
		}

		const single: typescript.Type = rest[0] ?? current;

		if (isLeaf(single) || isOpaqueClass(single)) {
			found.push({
				path: prefix,
				type: checker.typeToString(single),
				optional: soFar,
			});
			return;
		}

		if (checker.isArrayType(single)) {
			const [element] = checker.getTypeArguments(
				single as typescript.TypeReference,
			);

			if (element === undefined) {
				found.push({ path: prefix, type: 'unknown[]', optional: soFar });
				return;
			}

			walk(element, `${prefix}[]`, soFar, open, depth + 1);
			return;
		}

		// A type containing itself has infinitely many paths. The honest answer
		// is where the repeat begins, with the type named at the end of it.
		if (open.has(single) || depth > MAX_DEPTH) {
			found.push({
				path: prefix,
				type: checker.typeToString(single),
				optional: soFar,
			});
			return;
		}

		const properties: readonly typescript.Symbol[] = single
			.getProperties()
			.filter((property) => isReportable(property.getName()));

		if (properties.length === 0) {
			found.push({
				path: prefix,
				type: checker.typeToString(single),
				optional: soFar,
			});
			return;
		}

		const next = new Set(open);
		next.add(single);

		for (const property of properties) {
			const declared: typescript.Type = checker.getTypeOfSymbolAtLocation(
				property,
				at,
			);

			const name: string = property.getName();

			walk(
				declared,
				prefix === '' ? name : `${prefix}.${name}`,
				soFar || (property.flags & typescript.SymbolFlags.Optional) !== 0,
				next,
				depth + 1,
			);
		}
	};

	walk(type, '', false, new Set(), 0);

	// A single entry with an empty path means the root itself was a leaf, which
	// is not a walk anyone asked for.
	if (found.length === 0) return null;
	if (found.length === 1 && found[0].path === '') return null;

	return found;
};
