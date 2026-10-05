import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/memory`, `FULCRO7xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme. Empty until the package throws its first error,
 * which is registered here in the same change as the feature that throws it.
 */
export const memoryCatalog = {} as const satisfies RangeCatalog<'7'>;
