import typescript from 'typescript';

import {
	buildStructuralTest,
	CallRewriter,
	RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

/**
 * The rewrite `is` and `as` share.
 *
 * ```ts
 * // written                  // emitted
 * is<Order>(payload)          is(payload, { name: 'Order', matches: … })
 * as<Order>(payload)          as(payload, { name: 'Order', matches: …, explain: … })
 * ```
 *
 * A type argument is gone by the time the value arrives, so without this the
 * call reaches the runtime knowing nothing about what it was asked to check.
 * That is why the runtime halves refuse rather than guess.
 *
 * The call is kept and a test added to it, rather than being replaced outright
 * as `defaultOf` is. The runtime is what decides between returning, branching
 * and throwing — and what builds the message when it throws — and none of that
 * belongs in emitted code repeated at every call site.
 */

/**
 * Builds the rewriter for one of the two utilities.
 *
 * @param functionName Name of the function being claimed, which is also the
 * folder it is declared in — each lives in its own module, and looking for it
 * anywhere else would mean claiming a call whose declaration was never found.
 * @param explain Whether a failing value should be described. `as` wants it and
 * `is` does not: a branch needs yes or no, while a refusal has to be
 * actionable, and emitting the walker at every `is` would double the code for a
 * message nobody asks for.
 * @returns The rewriter.
 */
export const checkRewriter = (
	functionName: string,
	explain: boolean,
): CallRewriter => ({
	functionName,
	moduleSegment: utilityModuleSegment(functionName),

	rewrite: (
		call: typescript.CallExpression,
		context: RewriteContext,
	): typescript.Node | null => {
		const [typeArgument] = call.typeArguments ?? [];
		const [value] = call.arguments;

		// Written with a test already, or with no type to resolve: the argument
		// the consumer wrote wins, and a call with nothing to check is left for
		// the runtime to refuse.
		if (typeArgument === undefined || value === undefined) return null;
		if (call.arguments.length > 1) return null;

		const { checker, factory } = context;

		const type: typescript.Type = checker.getTypeFromTypeNode(typeArgument);

		const written: string = checker.typeToString(
			type,
			undefined,
			typescript.TypeFormatFlags.NoTruncation,
		);

		const test: typescript.Expression | null = buildStructuralTest(
			type,
			written,
			call,
			context,
			{ explain },
		);

		// Left exactly as written when the type cannot be checked honestly, so
		// the runtime refuses out loud rather than a half-check being emitted.
		if (test === null) return null;

		return factory.updateCallExpression(
			call,
			context.visit(call.expression) as typescript.Expression,
			// Dropped: the type argument has done its work, and leaving it would
			// no longer match the signature now that a second argument is passed.
			undefined,
			[context.visit(value) as typescript.Expression, test],
		);
	},
});
