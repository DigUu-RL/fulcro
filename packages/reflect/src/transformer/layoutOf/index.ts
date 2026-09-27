import {
	type CallRewriter,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { type ReadLayout, readLayout } from '@/transformer/layout';
import { frozenObject } from '@/transformer/literal';

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
		const frozen = (
			members: Parameters<typeof frozenObject>[1],
		): ReturnType<typeof frozenObject> => frozenObject(factory, members);

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
