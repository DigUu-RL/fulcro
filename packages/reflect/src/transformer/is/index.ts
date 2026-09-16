import { CallRewriter } from '@fulcro/transform-core';

import { checkRewriter } from '@/transformer/shared';

/**
 * Rewriter of `is`.
 *
 * Emits the yes-or-no check and nothing more: a branch needs to know whether
 * the value matched, never where it stopped matching.
 */
export const isRewriter: CallRewriter = checkRewriter('is', false);
