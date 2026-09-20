import typescript from 'typescript';

import {
	CallRewriter,
	RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { keysOfType } from '@/transformer/describe';

/**
 * Rewriter of `keysOf`.
 *
 * ```ts
 * // written              // emitted
 * keysOf<Order>()         keysOf(["id", "customer", "total"])
 * ```
 *
 * The keys of a type, which a runtime cannot read because the type is gone by
 * then — and which are not the keys of a value, since structural typing lets an
 * object carry more than its type declares.
 */
export const keysOfRewriter: CallRewriter = {
	functionName: 'keysOf',
	moduleSegment: utilityModuleSegment('keysOf'),

	rewrite: (
		call: typescript.CallExpression,
		{ checker, factory }: RewriteContext,
	): typescript.Node | null => {
		const [typeArgument] = call.typeArguments ?? [];

		// Written with keys already, or with no type: the argument wins, and a
		// call with nothing to read is left for the runtime to refuse.
		if (typeArgument === undefined || call.arguments.length > 0) return null;

		const keys: readonly string[] | null = keysOfType(
			checker.getTypeFromTypeNode(typeArgument),
		);

		// A primitive, a union, a class: nothing to list, and an empty array
		// would look like an answer rather than a refusal.
		if (keys === null) return null;

		return factory.updateCallExpression(call, call.expression, undefined, [
			factory.createArrayLiteralExpression(
				keys.map((key) => factory.createStringLiteral(key)),
				false,
			),
		]);
	},
};
