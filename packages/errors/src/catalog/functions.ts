import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/functions`, `FULCRO2xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const functionsCatalog = {
	FULCRO2001: {
		kind: Error,
		message: (thrown: null | undefined) =>
			`Operation rejected with ${String(thrown)}`,
		cause: (thrown: null | undefined) => thrown,
	},
} as const satisfies RangeCatalog<'2'>;
