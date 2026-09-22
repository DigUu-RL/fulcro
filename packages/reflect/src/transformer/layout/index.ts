import typescript from 'typescript';

import { type RewriteContext } from '@fulcro/transform-core';

/**
 * Reading shared by the rewriters of `sizeOf` and `alignOf`.
 *
 * Both answer from the same place — the `'~layout'` property a type declares —
 * and differ only in which member of it they read.
 */

/** Members of a declared layout. */
export type LayoutMember = 'size' | 'alignment';

/**
 * Reads one member of the layout the type argument of a call declares.
 *
 * Declines — returns `null`, leaving the call to throw at runtime — whenever
 * there is no single number to emit: no type argument, a type parameter not
 * yet substituted, a union whose members declare different layouts, or a
 * member that is not a number literal. A type with no layout at all never gets
 * here; it fails the constraint of the call first, in the editor.
 *
 * @param call Call being rewritten.
 * @param context Compilation in progress.
 * @param member Which member to read.
 * @returns The literal to emit, or `null` to leave the call alone.
 */
export const readLayoutMember = (
	call: typescript.CallExpression,
	{ checker, factory }: RewriteContext,
	member: LayoutMember,
): typescript.Expression | null => {
	const [typeArgument] = call.typeArguments ?? [];

	if (typeArgument === undefined) return null;

	const type: typescript.Type = checker.getTypeFromTypeNode(typeArgument);

	if ((type.flags & typescript.TypeFlags.TypeParameter) !== 0) return null;

	const layout: typescript.Symbol | undefined = checker.getPropertyOfType(
		type,
		'~layout',
	);

	if (layout === undefined) return null;

	const property: typescript.Symbol | undefined = checker.getPropertyOfType(
		checker.getTypeOfSymbolAtLocation(layout, call),
		member,
	);

	if (property === undefined) return null;

	const value: typescript.Type = checker.getTypeOfSymbolAtLocation(
		property,
		call,
	);

	return value.isNumberLiteral()
		? factory.createNumericLiteral(value.value)
		: null;
};
