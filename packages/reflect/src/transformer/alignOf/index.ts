import {
	type CallRewriter,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { readLayoutMember } from '@/transformer/layout';

/**
 * Rewriter of `alignOf`.
 *
 * Replaces the call with the alignment its type argument declares:
 *
 * ```ts
 * // written                          // emitted
 * alignOf<UnsignedInteger<16>>()      2
 * alignOf<Decimal>()                  16
 * ```
 */
export const alignOfRewriter: CallRewriter = {
	functionName: 'alignOf',
	moduleSegment: utilityModuleSegment('alignOf'),
	rewrite: (call, context) => readLayoutMember(call, context, 'alignment'),
};
