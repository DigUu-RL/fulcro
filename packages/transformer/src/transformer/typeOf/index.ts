import * as path from 'node:path';
import typescript from 'typescript';

import {
	CallRewriter,
	isTupleType,
	RewriteContext,
	utilityModuleSegment,
} from '@/transformer/shared';

/**
 * Rewriter of `typeOf`.
 *
 * Leaves the call in place and appends the description of the declared type of
 * its argument, which is the half a runtime inspection can never recover:
 *
 * ```ts
 * // written        // emitted
 * typeOf(user)      typeOf(user, { text: 'User', kind: 'interface', site: { ... } })
 * ```
 *
 * The injected literal lands in the `declared` field of the result. A project
 * compiling without the transformer simply reads `null` there, and everything
 * the runtime can establish on its own keeps working.
 */

/**
 * Resolves how a type was declared.
 *
 * @param type Type being described.
 * @param declaration First declaration of the type, when it has one.
 * @returns The kind of the declaration.
 */
const resolveKind = (
	type: typescript.Type,
	declaration: typescript.Declaration | undefined,
): string => {
	if (declaration !== undefined) {
		if (typescript.isInterfaceDeclaration(declaration)) return 'interface';
		if (typescript.isClassDeclaration(declaration)) return 'class';
		if (typescript.isTypeAliasDeclaration(declaration)) return 'type-alias';
		if (typescript.isEnumDeclaration(declaration)) return 'enum';
	}

	const { flags } = type;

	if (type.isUnion()) return 'union';
	if (type.isIntersection()) return 'intersection';
	if (type.isLiteral() || (flags & typescript.TypeFlags.BooleanLiteral) !== 0)
		return 'literal';

	if (
		(flags &
			(typescript.TypeFlags.String |
				typescript.TypeFlags.Number |
				typescript.TypeFlags.Boolean |
				typescript.TypeFlags.BigInt |
				typescript.TypeFlags.ESSymbol |
				typescript.TypeFlags.Void |
				typescript.TypeFlags.Undefined |
				typescript.TypeFlags.Null)) !==
		0
	)
		return 'primitive';

	if ((flags & typescript.TypeFlags.Object) !== 0) {
		const objectType = type as typescript.ObjectType;

		if (isTupleType(objectType)) return 'tuple';
		if (type.getCallSignatures().length > 0) return 'function';

		return 'object';
	}

	return 'unknown';
};

/**
 * Builds the literal describing where a type was declared.
 *
 * @param declaration Declaration of the type, when it has one.
 * @param factory Node factory of the current transformation.
 * @param projectRoot Root the path is made relative to.
 * @returns The literal, or a `null` literal for a type with no declaration.
 */
const buildSiteLiteral = (
	declaration: typescript.Declaration | undefined,
	factory: typescript.NodeFactory,
	projectRoot: string,
): typescript.Expression => {
	if (declaration === undefined) return factory.createNull();

	const sourceFile: typescript.SourceFile = declaration.getSourceFile();
	const position = sourceFile.getLineAndCharacterOfPosition(
		declaration.getStart(sourceFile),
	);

	// Relative and slash separated, so the emitted literal does not leak the
	// machine it was compiled on and reads the same on every platform.
	const relative: string = path
		.relative(projectRoot, sourceFile.fileName)
		.split(path.sep)
		.join('/');

	return factory.createObjectLiteralExpression(
		[
			factory.createPropertyAssignment(
				'path',
				factory.createStringLiteral(relative),
			),
			factory.createPropertyAssignment(
				'line',
				factory.createNumericLiteral(position.line + 1),
			),
			factory.createPropertyAssignment(
				'column',
				factory.createNumericLiteral(position.character + 1),
			),
		],
		true,
	);
};

/**
 * Builds the object literal describing a type, to be injected into the call.
 *
 * @param type Type being described.
 * @param context Compilation in progress.
 * @returns The literal describing the type.
 */
const buildDeclaredLiteral = (
	type: typescript.Type,
	{ checker, factory, projectRoot }: RewriteContext,
): typescript.ObjectLiteralExpression => {
	const symbol: typescript.Symbol | undefined =
		type.aliasSymbol ?? type.getSymbol();
	const declaration: typescript.Declaration | undefined =
		symbol?.declarations?.[0];

	const text: string = checker.typeToString(
		type,
		undefined,
		typescript.TypeFormatFlags.NoTruncation,
	);

	// An anonymous shape has a synthetic symbol name such as `__type`, which
	// would be noise rather than a name.
	const rawName: string | undefined = symbol?.getName();
	const name: string | null =
		rawName !== undefined && !rawName.startsWith('__') ? rawName : null;

	return factory.createObjectLiteralExpression(
		[
			factory.createPropertyAssignment(
				'text',
				factory.createStringLiteral(text),
			),
			factory.createPropertyAssignment(
				'name',
				name === null
					? factory.createNull()
					: factory.createStringLiteral(name),
			),
			factory.createPropertyAssignment(
				'kind',
				factory.createStringLiteral(resolveKind(type, declaration)),
			),
			factory.createPropertyAssignment(
				'site',
				buildSiteLiteral(declaration, factory, projectRoot),
			),
		],
		true,
	);
};

/** Rewriter appending the declared type of the argument to a `typeOf` call. */
export const typeOfRewriter: CallRewriter = {
	functionName: 'typeOf',
	moduleSegment: utilityModuleSegment('typeOf'),

	rewrite: (
		call: typescript.CallExpression,
		context: RewriteContext,
	): typescript.Node | null => {
		// Already carries its injected description, from a nested pass.
		if (call.arguments.length !== 1) return null;

		const { checker, factory, visit } = context;
		const [argument] = call.arguments;

		return factory.updateCallExpression(
			call,
			call.expression,
			call.typeArguments,
			factory.createNodeArray([
				typescript.visitNode(argument, visit) as typescript.Expression,
				buildDeclaredLiteral(checker.getTypeAtLocation(argument), context),
			]),
		);
	},
};
