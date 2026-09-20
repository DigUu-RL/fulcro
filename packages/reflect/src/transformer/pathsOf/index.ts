import typescript from 'typescript';

import {
	CallRewriter,
	RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { Path, pathsOfType } from '@/transformer/describe';

/**
 * Rewriter of `pathsOf`.
 *
 * ```ts
 * // written              // emitted
 * pathsOf<Order>()        pathsOf([
 *                           { path: "id", type: "number", optional: false },
 *                           { path: "customer.email", type: "string", … },
 *                           { path: "items[].sku", type: "string", … },
 *                         ])
 * ```
 *
 * Every leaf the type can be walked to, listed once at build time rather than
 * discovered by reflecting over a value — which could only ever report the
 * properties that value happened to carry.
 */
export const pathsOfRewriter: CallRewriter = {
	functionName: 'pathsOf',
	moduleSegment: utilityModuleSegment('pathsOf'),

	rewrite: (
		call: typescript.CallExpression,
		{ checker, factory }: RewriteContext,
	): typescript.Node | null => {
		const [typeArgument] = call.typeArguments ?? [];

		if (typeArgument === undefined || call.arguments.length > 0) return null;

		const paths: readonly Path[] | null = pathsOfType(
			checker.getTypeFromTypeNode(typeArgument),
			checker,
			call,
		);

		// A primitive has no paths, and an empty array would read as an answer.
		if (paths === null) return null;

		return factory.updateCallExpression(call, call.expression, undefined, [
			factory.createArrayLiteralExpression(
				paths.map((entry) =>
					factory.createObjectLiteralExpression(
						[
							factory.createPropertyAssignment(
								'path',
								factory.createStringLiteral(entry.path),
							),
							factory.createPropertyAssignment(
								'type',
								factory.createStringLiteral(entry.type),
							),
							factory.createPropertyAssignment(
								'optional',
								entry.optional ? factory.createTrue() : factory.createFalse(),
							),
						],
						false,
					),
				),
				true,
			),
		]);
	},
};
