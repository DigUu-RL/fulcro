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
	FULCRO7005: {
		kind: RangeError,
		message: ({
			operation,
			received,
		}: {
			operation: string;
			received: number | string;
		}) =>
			`${operation}: expected a size in bytes that is a non-negative safe integer, received ${received}.`,
	},
	FULCRO7006: {
		kind: RangeError,
		message: ({
			operation,
			received,
		}: {
			operation: string;
			received: number | string;
		}) =>
			`${operation}: expected an alignment that is a positive power of two, received ${received}.`,
	},
	FULCRO7007: {
		kind: RangeError,
		message: ({
			operation,
			requested,
			alignment,
			available,
			capacity,
		}: {
			operation: string;
			requested: number;
			alignment: number;
			available: number;
			capacity: number;
		}) =>
			`${operation}: ${requested} bytes aligned to ${alignment} were requested, but only ${available} of ${capacity} bytes remain.`,
	},
	FULCRO7008: {
		kind: Error,
		message: ({
			operation,
			depth,
			innermost,
		}: {
			operation: string;
			depth: number;
			innermost: number;
		}) =>
			`${operation}: frame ${depth} is not the innermost open frame, ${innermost}; frames are allocated from and left in last-in, first-out order.`,
	},
	FULCRO7009: {
		kind: Error,
		message: ({ operation }: { operation: string }) =>
			`${operation}: the memory was released by its allocator, and may already hold other values.`,
	},
	FULCRO7010: {
		kind: RangeError,
		message: ({
			operation,
			requested,
			alignment,
			blockSize,
		}: {
			operation: string;
			requested: number;
			alignment: number;
			blockSize: number;
		}) =>
			`${operation}: ${requested} bytes aligned to ${alignment} do not fit a pool block of ${blockSize} bytes.`,
	},
	FULCRO7011: {
		kind: Error,
		message: ({ operation }: { operation: string }) =>
			`${operation}: the allocation was not made by this allocator.`,
	},
	FULCRO7012: {
		kind: Error,
		message: ({ operation, depth }: { operation: string; depth: number }) =>
			`${operation}: frame ${depth} was already left; enter a new one.`,
	},
	FULCRO7013: {
		kind: TypeError,
		message: ({
			operation,
			received,
		}: {
			operation: string;
			received: string;
		}) => `${operation}: expected an ArrayBuffer, received ${received}.`,
	},
	FULCRO7014: {
		kind: RangeError,
		message: ({
			operation,
			start,
			length,
			available,
		}: {
			operation: string;
			start: number | string;
			length: number | string;
			available: number;
		}) =>
			`${operation}: ${length} values from position ${start} do not fit in a source of ${available}.`,
	},
	FULCRO7015: {
		kind: RangeError,
		message: ({
			operation,
			index,
			length,
		}: {
			operation: string;
			index: number;
			length: number;
		}) =>
			`${operation}: position ${index} is past the end of the array, which now holds ${length} values; it shrank after it was viewed.`,
	},
	FULCRO7016: {
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
			`${operation}: position ${index} is outside 0 to ${length}, where a pointer into ${length} values may point.`,
	},
	FULCRO7017: {
		kind: TypeError,
		message: ({
			operation,
			expected,
			received,
		}: {
			operation: string;
			expected: string;
			received: string;
		}) => `${operation}: expected ${expected}, received ${received}.`,
	},
} as const satisfies RangeCatalog<'7'>;
