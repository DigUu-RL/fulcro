import typescript from 'typescript';

import {
	CallRewriter,
	RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

/**
 * Rewriter of `pathOf`.
 *
 * ```ts
 * // written                            // emitted
 * pathOf(() => user.profile.email)      "profile.email"
 * pathOf(() => order.items[0].sku)      "items[0].sku"
 * ```
 *
 * The runtime can read this by parsing the source of the closure, which works
 * and is at the mercy of a minifier. Resolving it here removes both the closure
 * and the parsing, and settles the answer before anything can rename a
 * property.
 */

/**
 * Collects the segments of a member access, from the root outwards.
 *
 * @param expression Expression being read.
 * @param into Segments gathered so far, innermost first.
 * @returns `true` when the whole expression is a path.
 */
const collect = (
	expression: typescript.Expression,
	into: string[],
): boolean => {
	if (typescript.isParenthesizedExpression(expression)) {
		return collect(expression.expression, into);
	}

	if (typescript.isNonNullExpression(expression)) {
		return collect(expression.expression, into);
	}

	// The root. It is not part of the answer — the path is relative to whatever
	// object is being described — so reaching an identifier ends the walk.
	if (typescript.isIdentifier(expression)) return true;

	if (typescript.isPropertyAccessExpression(expression)) {
		if (!collect(expression.expression, into)) return false;

		into.push(`.${expression.name.text}`);

		return true;
	}

	if (typescript.isElementAccessExpression(expression)) {
		if (!collect(expression.expression, into)) return false;

		const argument: typescript.Expression = expression.argumentExpression;

		// A quoted key reads as an ordinary segment; an index keeps its brackets,
		// since `items.0.sku` is not how anyone writes a path.
		if (typescript.isStringLiteralLike(argument)) {
			into.push(`.${argument.text}`);
			return true;
		}

		if (typescript.isNumericLiteral(argument)) {
			into.push(`[${argument.text}]`);
			return true;
		}

		// A computed key is only known at runtime, so there is no literal to
		// emit and the runtime parser is left to deal with it.
		return false;
	}

	return false;
};

/**
 * Reads the path out of an accessor argument.
 *
 * @param argument Argument of the call, expected to be `() => a.b.c`.
 * @returns The path, or `null` when the argument does not walk one.
 */
const pathOfAccessor = (argument: typescript.Expression): string | null => {
	const body: typescript.Expression | null = typescript.isArrowFunction(
		argument,
	)
		? typescript.isBlock(argument.body)
			? returnedBy(argument.body)
			: argument.body
		: typescript.isFunctionExpression(argument)
			? returnedBy(argument.body)
			: null;

	if (body === null) return null;

	const segments: string[] = [];

	if (!collect(body, segments)) return null;
	if (segments.length === 0) return null;

	return segments.join('').replace(/^\./, '');
};

/**
 * Reads the expression a single-statement body returns.
 *
 * @param body Block being read.
 * @returns The returned expression, or `null`.
 */
const returnedBy = (body: typescript.Block): typescript.Expression | null => {
	const [statement] = body.statements;

	return statement !== undefined &&
		typescript.isReturnStatement(statement) &&
		statement.expression !== undefined
		? statement.expression
		: null;
};

/** Rewriter turning a `pathOf` call into the path it walks. */
export const pathOfRewriter: CallRewriter = {
	functionName: 'pathOf',
	moduleSegment: utilityModuleSegment('pathOf'),

	rewrite: (
		call: typescript.CallExpression,
		{ factory }: RewriteContext,
	): typescript.Node | null => {
		const [argument] = call.arguments;

		if (argument === undefined) return null;

		const path: string | null = pathOfAccessor(argument);

		// Anything else keeps the runtime implementation, which parses the source
		// of the closure and handles the forms this does not.
		return path === null ? null : factory.createStringLiteral(path);
	},
};
