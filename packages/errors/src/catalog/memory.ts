import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/memory`, `FULCRO7xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 *
 * A length or an index arrives as the number it was when it was one, and as
 * the description of what it was otherwise: a JavaScript caller can hand in
 * anything, and a detail holds primitives only.
 */
export const memoryCatalog = {
	FULCRO7001: {
		kind: RangeError,
		message: ({
			operation,
			received,
		}: {
			operation: string;
			received: number | string;
		}) =>
			`${operation}: expected a length that is a non-negative safe integer, received ${received}.`,
	},
	FULCRO7002: {
		kind: RangeError,
		message: ({
			operation,
			index,
			length,
		}: {
			operation: string;
			index: number | string;
			length: number;
		}) =>
			`${operation}: index ${index} is outside a storage of length ${length}.`,
	},
	FULCRO7003: {
		kind: TypeError,
		message: ({ operation, missing }: { operation: string; missing: string }) =>
			`${operation}: expected an element type with a name, layout.size, read, write and is; ${missing} is missing.`,
	},
	FULCRO7004: {
		kind: TypeError,
		message: ({ operation, element }: { operation: string; element: string }) =>
			`${operation}: the value is not a value of ${element}.`,
	},
} as const satisfies RangeCatalog<'7'>;
