import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/transform-core`, `FULCRO5xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const transformCoreCatalog = {
	FULCRO5001: {
		kind: Error,
		message: (root: string) =>
			`No tsconfig.json found from ${root}. The transformer needs one to ` +
			'know which files belong to the program.',
	},
	FULCRO5002: {
		kind: Error,
		// The compiler's own diagnostic, flattened: it already names the file and
		// what is wrong with it, and rewording it would lose what TypeScript
		// knows and this package does not.
		message: (diagnostic: string) => diagnostic,
	},
} as const satisfies RangeCatalog<'5'>;
