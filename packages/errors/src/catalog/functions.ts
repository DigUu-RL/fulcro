import type { RangeCatalog } from '@/src/definition';

/**
 * The errors of `@fulcro/functions`, `FULCRO2xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const functionsCatalog = {
	FULCRO2001: {
		kind: Error,
		message: ({ thrown }: { operation: string; thrown: null | undefined }) => {
			return `Operation rejected with ${String(thrown)}`;
		},
		cause: ({ thrown }: { operation: string; thrown: null | undefined }) => thrown,
	},
	FULCRO2002: {
		kind: TypeError,
		message: ({ operation, received }: { operation: string; received: string }) => {
			return `${operation}: expected an array of rules, received ${received}.`;
		},
	},
	FULCRO2003: {
		kind: TypeError,
		message: ({
			operation,
			index,
			member,
			received,
		}: {
			operation: string;
			index: number;
			member: string;
			received: string;
		}) => {
			return `${operation}: rule ${String(index)} needs '${member}' to be a function, received ${received}.`;
		},
	},
} as const satisfies RangeCatalog<'2'>;
