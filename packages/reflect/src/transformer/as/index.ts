import { CallRewriter } from '@fulcro/transform-core';

import { checkRewriter } from '@/transformer/shared';

/**
 * Rewriter of `as`.
 *
 * Emits a second walker beside the check, so a refusal can name the path that
 * failed. It runs only once the check has already refused, so a value that
 * passes never pays for it.
 */
export const asRewriter: CallRewriter = checkRewriter('as', true);
