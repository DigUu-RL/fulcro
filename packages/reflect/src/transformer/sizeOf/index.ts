import {
	type CallRewriter,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { readLayoutMember } from '@/transformer/layout';

/**
 * Rewriter of `sizeOf`.
 *
 * Replaces the call with the size its type argument declares:
 *
 * ```ts
 * // written                        // emitted
 * sizeOf<SignedInteger<32>>()       4
 * sizeOf<Decimal>()                 16
 * ```
 */
export const sizeOfRewriter: CallRewriter = {
	functionName: 'sizeOf',
	moduleSegment: utilityModuleSegment('sizeOf'),
	rewrite: (call, context) => readLayoutMember(call, context, 'size'),
};
