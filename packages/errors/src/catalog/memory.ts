import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/memory`, `FULCRO7xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const memoryCatalog = {
	FULCRO7001: {
		kind: RangeError,
		message: (operation: string, received: string) =>
			`${operation}: expected a length that is a non-negative safe integer, received ${received}.`,
	},
	FULCRO7002: {
		kind: RangeError,
		message: (operation: string, index: string, length: number) =>
			`${operation}: index ${index} is outside a storage of length ${length}.`,
	},
	FULCRO7003: {
		kind: TypeError,
		message: (operation: string, missing: string) =>
			`${operation}: expected an element type with a name, layout.size, read, write and is; ${missing} is missing.`,
	},
	FULCRO7004: {
		kind: TypeError,
		message: (operation: string, element: string) =>
			`${operation}: the value is not a value of ${element}.`,
	},
} as const satisfies RangeCatalog<'7'>;
