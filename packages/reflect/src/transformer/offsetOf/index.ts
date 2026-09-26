import typescript from 'typescript';

import {
	type CallRewriter,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { type PlacedField, readLayout } from '@/transformer/layout';

/**
 * Rewriter of `offsetOf`.
 *
 * Replaces the call with the offset of the named field, placed from the order
 * the struct's fields were declared in:
 *
 * ```ts
 * // written                        // emitted
 * offsetOf<Vector3>('y')            4
 * ```
 *
 * Declines — leaving the call to throw — when the field is not written as a
 * string literal, since a name held in a variable is not known until it runs,
 * and on everything `readLayout` declines on. A name that is not a field never
 * gets here; it fails the parameter type first, in the editor.
 */
export const offsetOfRewriter: CallRewriter = {
	functionName: 'offsetOf',
	moduleSegment: utilityModuleSegment('offsetOf'),
	rewrite: (call, context) => {
		const [field] = call.arguments;

		if (
			field === undefined ||
			!typescript.isStringLiteralLike(field) ||
			call.arguments.length !== 1
		) {
			return null;
		}

		const placed: PlacedField | undefined = readLayout(
			call,
			context,
		)?.fields.find((candidate) => candidate.name === field.text);

		return placed === undefined
			? null
			: context.factory.createNumericLiteral(placed.offset);
	},
};
