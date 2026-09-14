import typescript from 'typescript';

import {
	CallRewriter,
	RewriteContext,
	utilityModuleSegment,
} from '@/transformer/shared';

/**
 * Rewriter of `nameOf`.
 *
 * Resolves two forms while the compiler still knows what they refer to:
 *
 * ```ts
 * // written                  // emitted
 * nameOf(() => user.email)    'email'
 * nameOf<UserContract>()      'UserContract'
 * ```
 *
 * The second one is the reason this exists at all — an interface leaves nothing
 * behind to inspect at runtime. The first is an optimisation: the runtime can
 * read it by parsing the source of the closure, but doing it here removes both
 * the closure and the parsing.
 */

/**
 * Extracts the member name an expression reads.
 *
 * A path reports its last segment, which is the part naming the member.
 *
 * @param expression Expression being read.
 * @returns The name, or `null` when the expression names nothing.
 */
const nameOfExpression = (expression: typescript.Expression): string | null => {
	if (typescript.isParenthesizedExpression(expression))
		return nameOfExpression(expression.expression);

	if (typescript.isNonNullExpression(expression))
		return nameOfExpression(expression.expression);

	if (typescript.isIdentifier(expression)) return expression.text;

	if (typescript.isPropertyAccessExpression(expression))
		return expression.name.text;

	if (
		typescript.isElementAccessExpression(expression) &&
		typescript.isStringLiteralLike(expression.argumentExpression)
	)
		return expression.argumentExpression.text;

	return null;
};

/**
 * Extracts the name an accessor argument points at.
 *
 * @param argument Argument of the call, expected to be `() => something`.
 * @returns The name, or `null` when the argument is not an accessor.
 */
const nameOfAccessor = (argument: typescript.Expression): string | null => {
	if (typescript.isArrowFunction(argument)) {
		if (typescript.isBlock(argument.body)) {
			const [statement] = argument.body.statements;

			return statement !== undefined &&
				typescript.isReturnStatement(statement) &&
				statement.expression !== undefined
				? nameOfExpression(statement.expression)
				: null;
		}

		return nameOfExpression(argument.body);
	}

	if (typescript.isFunctionExpression(argument)) {
		const [statement] = argument.body.statements;

		return statement !== undefined &&
			typescript.isReturnStatement(statement) &&
			statement.expression !== undefined
			? nameOfExpression(statement.expression)
			: null;
	}

	return null;
};

/** Rewriter turning a `nameOf` call into the name it resolves to. */
export const nameOfRewriter: CallRewriter = {
	functionName: 'nameOf',
	moduleSegment: utilityModuleSegment('nameOf'),

	rewrite: (
		call: typescript.CallExpression,
		{ checker, factory }: RewriteContext,
	): typescript.Node | null => {
		// `nameOf<SomeInterface>()` — the whole point of compiling this away,
		// since an interface leaves nothing behind to inspect.
		const [typeArgument] = call.typeArguments ?? [];

		if (typeArgument !== undefined && call.arguments.length === 0) {
			const type: typescript.Type = checker.getTypeFromTypeNode(typeArgument);
			const symbol: typescript.Symbol | undefined =
				type.aliasSymbol ?? type.getSymbol();

			const name: string =
				symbol?.getName() ??
				checker.typeToString(
					type,
					undefined,
					typescript.TypeFormatFlags.NoTruncation,
				);

			return factory.createStringLiteral(name);
		}

		const [argument] = call.arguments;

		if (argument === undefined) return null;

		const name: string | null = nameOfAccessor(argument);

		// Anything else keeps the runtime implementation, which still handles
		// classes and plain values.
		return name === null ? null : factory.createStringLiteral(name);
	},
};
