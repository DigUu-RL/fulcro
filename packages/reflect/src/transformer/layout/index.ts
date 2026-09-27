import typescript from 'typescript';

import { type RewriteContext } from '@fulcro/transform-core';

/**
 * Reading shared by the rewriters of `sizeOf`, `alignOf`, `offsetOf` and
 * `layoutOf`.
 *
 * All four answer from the same place — the `'~layout'` property a type
 * declares — and differ only in how much of it they read.
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

/** A field, placed: where it sits and how much room it takes. */
export interface PlacedField {
	readonly name: string;
	readonly offset: number;
	readonly size: number;
	readonly alignment: number;
}

/** The whole layout of a type, as `layoutOf` and `offsetOf` read it. */
export interface ReadLayout {
	readonly size: number;
	readonly alignment: number;
	/** In the order the fields were declared, which is not the order placed. */
	readonly fields: readonly PlacedField[];
}

/**
 * Reads a member of a type as a number literal.
 *
 * @param type Type holding the member.
 * @param member Name of the member.
 * @param checker Checker of the program.
 * @param call Call being rewritten, the location types are read at.
 * @returns The number, or `null` when the member is missing or not a literal.
 */
const readNumber = (
	type: typescript.Type,
	member: string,
	checker: typescript.TypeChecker,
	call: typescript.Node,
): number | null => {
	const property: typescript.Symbol | undefined = checker.getPropertyOfType(
		type,
		member,
	);

	if (property === undefined) return null;

	const value: typescript.Type = checker.getTypeOfSymbolAtLocation(
		property,
		call,
	);

	return value.isNumberLiteral() ? value.value : null;
};

/**
 * Reads the whole layout the type argument of a call declares, fields placed.
 *
 * The fields are listed on the layout of a struct without their offsets: an
 * offset depends on declaration order, which a type does not promise. The
 * checker keeps it regardless — the fields are a mapped type over the object a
 * struct was declared with, and its properties come back in the order they
 * were written, from source and from a declaration file alike. So the fields
 * are placed here by the rule `struct()` places them by at runtime: largest
 * alignment first, declaration order among equals, no padding between, since
 * every size is a multiple of its own alignment.
 *
 * Declines on everything `readLayoutMember` declines on, and on a union whose
 * members list fields: two structs of the same size may still place different
 * fields, and the checker would report only the fields they share.
 *
 * @param call Call being rewritten.
 * @param context Compilation in progress.
 * @returns The layout, or `null` to leave the call alone.
 */
export const readLayout = (
	call: typescript.CallExpression,
	{ checker }: RewriteContext,
): ReadLayout | null => {
	const [typeArgument] = call.typeArguments ?? [];

	if (typeArgument === undefined) return null;

	const type: typescript.Type = checker.getTypeFromTypeNode(typeArgument);

	if ((type.flags & typescript.TypeFlags.TypeParameter) !== 0) return null;

	const symbol: typescript.Symbol | undefined = checker.getPropertyOfType(
		type,
		'~layout',
	);

	if (symbol === undefined) return null;

	const layout: typescript.Type = checker.getTypeOfSymbolAtLocation(
		symbol,
		call,
	);
	const size: number | null = readNumber(layout, 'size', checker, call);
	const alignment: number | null = readNumber(
		layout,
		'alignment',
		checker,
		call,
	);

	if (size === null || alignment === null) return null;

	const members: readonly typescript.Type[] = layout.isUnion()
		? layout.types
		: [layout];
	const listsFields: boolean = members.some(
		(member) => checker.getPropertyOfType(member, 'fields') !== undefined,
	);

	if (!listsFields) return { size, alignment, fields: [] };

	if (layout.isUnion()) return null;

	const fieldsSymbol = checker.getPropertyOfType(
		layout,
		'fields',
	) as typescript.Symbol;
	const declared: { name: string; size: number; alignment: number }[] = [];

	for (const field of checker.getPropertiesOfType(
		checker.getTypeOfSymbolAtLocation(fieldsSymbol, call),
	)) {
		const fieldType: typescript.Type = checker.getTypeOfSymbolAtLocation(
			field,
			call,
		);
		const fieldSize: number | null = readNumber(
			fieldType,
			'size',
			checker,
			call,
		);
		const fieldAlignment: number | null = readNumber(
			fieldType,
			'alignment',
			checker,
			call,
		);

		if (fieldSize === null || fieldAlignment === null) return null;

		declared.push({
			name: field.name,
			size: fieldSize,
			alignment: fieldAlignment,
		});
	}

	const offsets = new Map<string, number>();
	let end = 0;

	// `sort` is stable, which keeps declaration order among equals — the same
	// statement, for the same reason, as the one in `struct()`.
	for (const field of [...declared].sort(
		(left, right) => right.alignment - left.alignment,
	)) {
		offsets.set(field.name, end);
		end += field.size;
	}

	return {
		size,
		alignment,
		fields: declared.map((field) => ({
			...field,
			offset: offsets.get(field.name) as number,
		})),
	};
};
