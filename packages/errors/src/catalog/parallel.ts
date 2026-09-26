import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/parallel`, `FULCRO3xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const parallelCatalog = {
	FULCRO3001: {
		kind: Error,
		message: (module: string, name: string) =>
			`${module} has no callable export named "${name}".`,
	},
	FULCRO3002: {
		kind: Error,
		message: () => 'This module is only meaningful inside a worker.',
	},
	FULCRO3003: {
		kind: Error,
		message: (workers: number | undefined) =>
			`A pool needs a positive integer worker count, and was given ${workers}.`,
	},

	// The four below carry a failure across the worker boundary. What crossed is
	// only text — a thrown value loses its class and its properties on the way —
	// so the text is kept exactly and the code says where it came from.
	FULCRO3004: {
		kind: Error,
		message: (reason: string) => reason,
	},
	FULCRO3005: {
		kind: Error,
		message: (reason: string) => reason,
	},
	FULCRO3006: {
		kind: Error,
		message: () => 'The worker was given a task before it was initialised.',
	},
	FULCRO3007: {
		kind: Error,
		message: (exitCode: number) => `The worker exited with code ${exitCode}.`,
	},
	FULCRO3008: {
		kind: Error,
		message: (reason: string) => reason,
	},
	FULCRO3009: {
		kind: Error,
		message: () => 'A message could not be cloned across the worker boundary.',
	},
} as const satisfies RangeCatalog<'3'>;
