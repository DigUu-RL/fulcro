import typescript from 'typescript';

import {
	type CallRewriter,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { type ReadLayout, readLayout } from '@/transformer/layout';

/**
 * A field name that can be written bare in an object literal. Anything else is
 * written quoted, which means the same thing and is only less pleasant to read.
 */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Rewriter of `layoutOf`.
 *
 * Replaces the call with the layout its type argument declares, as a frozen
 * object literal shaped like the `layout` of a struct's descriptor — frozen at
 * every level, with the fields in declaration order — so the two compare equal
 * and behave alike:
 *
 * ```ts
 * // written                  // emitted
 * layoutOf<Pair>()            Object.freeze({ size: 8, alignment: 4,
 *                               fields: Object.freeze({
 *                                 left: Object.freeze({ offset: 0, size: 4, alignment: 4 }),
 *                                 right: Object.freeze({ offset: 4, size: 4, alignment: 4 }) }) })
 * ```
 *
 * Declines on everything `readLayout` declines on.
 */
export const layoutOfRewriter: CallRewriter = {
	functionName: 'layoutOf',
	moduleSegment: utilityModuleSegment('layoutOf'),
	rewrite: (call, context) => {
		const layout: ReadLayout | null = readLayout(call, context);

		if (layout === null) return null;

		const { factory } = context;

		/**
		 * Emits `Object.freeze({ … })` over some number members.
		 *
		 * @param members Name and expression of each member, in order.
		 * @returns The expression.
		 */
		const frozen = (
			members: readonly (readonly [string, typescript.Expression])[],
		): typescript.Expression =>
			factory.createCallExpression(
				factory.createPropertyAccessExpression(
					factory.createIdentifier('Object'),
					'freeze',
				),
				undefined,
				[
					factory.createObjectLiteralExpression(
						members.map(([name, value]) =>
							factory.createPropertyAssignment(
								// `__proto__: …` in a literal sets the prototype rather than
								// a property; only the computed form makes it a field.
								name === '__proto__'
									? factory.createComputedPropertyName(
											factory.createStringLiteral(name),
										)
									: IDENTIFIER.test(name)
										? factory.createIdentifier(name)
										: factory.createStringLiteral(name),
								value,
							),
						),
					),
				],
			);

		return frozen([
			['size', factory.createNumericLiteral(layout.size)],
			['alignment', factory.createNumericLiteral(layout.alignment)],
			[
				'fields',
				frozen(
					layout.fields.map((field) => [
						field.name,
						frozen([
							['offset', factory.createNumericLiteral(field.offset)],
							['size', factory.createNumericLiteral(field.size)],
							['alignment', factory.createNumericLiteral(field.alignment)],
						]),
					]),
				),
			],
		]);
	},
};
