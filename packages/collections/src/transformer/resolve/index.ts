import typescript from 'typescript';

import { RewriteContext } from '@fulcro/transform-core';

/**
 * Turning a written type into a runtime test.
 *
 * `ofType` and `cast` both take a type argument and both need the same thing
 * from it: something that exists once the types are gone. There are exactly two
 * such things, and this module knows how to find them.
 *
 * A **primitive** becomes the string `typeof` answers with. A **class** becomes
 * a reference to the constructor, which is a real binding at runtime.
 *
 * Everything else — an interface, a type alias for an object shape, a union —
 * has no runtime form at all, and the honest answer is to refuse at compile
 * time rather than emit something that quietly tests the wrong thing.
 */

/** What a type argument resolved to, or why it could not be. */
export type Resolution =
	| { readonly kind: 'resolved'; readonly token: typescript.Expression }
	| { readonly kind: 'unsupported'; readonly reason: string };

/**
 * The primitive flags that have a `typeof` name, and that name.
 *
 * Deliberately not a lookup on `checker.typeToString`: a type alias prints as
 * its own name, and an alias of `string` has to resolve to `'string'` all the
 * same.
 */
const PRIMITIVE_NAMES: readonly (readonly [typescript.TypeFlags, string])[] = [
	[typescript.TypeFlags.StringLike, 'string'],
	[typescript.TypeFlags.NumberLike, 'number'],
	[typescript.TypeFlags.BigIntLike, 'bigint'],
	[typescript.TypeFlags.BooleanLike, 'boolean'],
	[typescript.TypeFlags.ESSymbolLike, 'symbol'],
	[typescript.TypeFlags.Undefined, 'undefined'],
];

/**
 * Names the `typeof` group a type belongs to, when it belongs to one.
 *
 * @param type Type being classified.
 * @returns The `typeof` name, or `null` when the type is not a primitive.
 */
const primitiveNameOf = (type: typescript.Type): string | null => {
	for (const [flag, name] of PRIMITIVE_NAMES) {
		if ((type.flags & flag) !== 0) return name;
	}

	return null;
};

/**
 * Finds the class declaration a type refers to, if it is one.
 *
 * A class is the only named type with a runtime counterpart: the constructor
 * is a value, and `instanceof` can be written against it. An interface with the
 * same shape is indistinguishable here at the type level and has nothing.
 *
 * @param type Type being inspected.
 * @returns The symbol of the class, or `null`.
 */
const classSymbolOf = (type: typescript.Type): typescript.Symbol | null => {
	const symbol: typescript.Symbol | undefined =
		type.getSymbol() ?? type.aliasSymbol;

	if (symbol === undefined) return null;

	const isClass: boolean = (symbol.flags & typescript.SymbolFlags.Class) !== 0;

	return isClass ? symbol : null;
};

/**
 * Tells whether a name is usable as a value at a given point in the source.
 *
 * A class imported with `import type` is erased from the emitted JavaScript, so
 * naming it in a runtime position would compile and then fail with a reference
 * error. Asked of the checker rather than assumed, because the import could
 * also be type-only through its clause, through a `verbatimModuleSyntax` build,
 * or simply not be imported at all.
 *
 * @param name Name being looked up.
 * @param at Node the lookup happens from, for scope.
 * @param checker Checker of the program being compiled.
 * @returns `true` when the name survives into the emitted code as a value.
 */
const isValueInScope = (
	name: string,
	at: typescript.Node,
	checker: typescript.TypeChecker,
): boolean => {
	const resolved: typescript.Symbol | undefined = checker.resolveName(
		name,
		at,
		typescript.SymbolFlags.Value,
		false,
	);

	if (resolved === undefined) return false;

	const declarations: readonly typescript.Declaration[] =
		resolved.declarations ?? [];

	// A type-only import resolves as a value here but is elided on emit, so the
	// declaration itself has to be checked.
	return !declarations.some((declaration) => {
		if (typescript.isImportSpecifier(declaration)) {
			return (
				declaration.isTypeOnly || declaration.parent.parent.isTypeOnly === true
			);
		}

		if (typescript.isImportClause(declaration)) return declaration.isTypeOnly;

		return false;
	});
};

/**
 * Resolves the type argument of a call into a runtime type token.
 *
 * @param typeArgument Type argument as written.
 * @param call Call it belongs to, used as the scope of the lookup.
 * @param context Compilation in progress.
 * @returns The token to pass at runtime, or why there can be none.
 */
export const resolveTypeToken = (
	typeArgument: typescript.TypeNode,
	call: typescript.CallExpression,
	{ checker, factory }: RewriteContext,
): Resolution => {
	const type: typescript.Type = checker.getTypeFromTypeNode(typeArgument);

	const primitive: string | null = primitiveNameOf(type);

	if (primitive !== null) {
		return {
			kind: 'resolved',
			token: factory.createStringLiteral(primitive),
		};
	}

	const classSymbol: typescript.Symbol | null = classSymbolOf(type);

	if (classSymbol !== null) {
		const name: string = classSymbol.getName();

		if (!isValueInScope(name, call, checker)) {
			return {
				kind: 'unsupported',
				reason: `${name} is not in scope as a value here. It is probably imported with \`import type\`, which is erased before this could run — import it normally.`,
			};
		}

		return { kind: 'resolved', token: factory.createIdentifier(name) };
	}

	const written: string = checker.typeToString(
		type,
		undefined,
		typescript.TypeFormatFlags.NoTruncation,
	);

	return {
		kind: 'unsupported',
		reason: `${written} has no runtime representation, so nothing can test for it. Only primitives and classes can be resolved; pass a type guard to \`where\` instead.`,
	};
};
