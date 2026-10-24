import type { RangeCatalog } from '@/src/definition';

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
		message: ({ operation, received }: { operation: string; received: number | string }) => {
			return `${operation}: expected a length that is a non-negative safe integer, received ${String(received)}.`;
		},
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
		}) => {
			return `${operation}: index ${String(index)} is outside a storage of length ${String(length)}.`;
		},
	},
	FULCRO7003: {
		kind: TypeError,
		message: ({ operation, missing }: { operation: string; missing: string }) => {
			return `${operation}: expected an element type with a name, layout.size, read, write and is; ${missing} is missing.`;
		},
	},
	FULCRO7004: {
		kind: TypeError,
		message: ({ operation, element }: { operation: string; element: string }) => {
			return `${operation}: the value is not a value of ${element}.`;
		},
	},
	FULCRO7005: {
		kind: RangeError,
		message: ({ operation, received }: { operation: string; received: number | string }) => {
			return `${operation}: expected a size in bytes that is a non-negative safe integer, received ${String(received)}.`;
		},
	},
	FULCRO7006: {
		kind: RangeError,
		message: ({ operation, received }: { operation: string; received: number | string }) => {
			return `${operation}: expected an alignment that is a positive power of two, received ${String(received)}.`;
		},
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
		}) => {
			return `${operation}: ${String(requested)} bytes aligned to ${String(alignment)} were requested, but only ${String(available)} of ${String(capacity)} bytes remain.`;
		},
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
		}) => {
			return `${operation}: frame ${String(depth)} is not the innermost open frame, ${String(innermost)}; frames are allocated from and left in last-in, first-out order.`;
		},
	},
	FULCRO7009: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the memory was released by its allocator, and may already hold other values.`;
		},
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
		}) => {
			return `${operation}: ${String(requested)} bytes aligned to ${String(alignment)} do not fit a pool block of ${String(blockSize)} bytes.`;
		},
	},
	FULCRO7011: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the allocation was not made by this allocator.`;
		},
	},
	FULCRO7012: {
		kind: Error,
		message: ({ operation, depth }: { operation: string; depth: number }) => {
			return `${operation}: frame ${String(depth)} was already left; enter a new one.`;
		},
	},
	FULCRO7013: {
		kind: TypeError,
		message: ({ operation, received }: { operation: string; received: string }) => {
			return `${operation}: expected an ArrayBuffer, received ${received}.`;
		},
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
		}) => {
			return `${operation}: ${String(length)} values from position ${String(start)} do not fit in a source of ${String(available)}.`;
		},
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
		}) => {
			return `${operation}: position ${String(index)} is past the end of the array, which now holds ${String(length)} values; it shrank after it was viewed.`;
		},
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
		}) => {
			return `${operation}: position ${String(index)} is outside 0 to ${String(length)}, where a pointer into ${String(length)} values may point.`;
		},
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
		}) => {
			return `${operation}: expected ${expected}, received ${received}.`;
		},
	},
	FULCRO7018: {
		kind: TypeError,
		message: ({ operation, received }: { operation: string; received: string }) => {
			return `${operation}: expected an ArrayBuffer or a WebAssembly.Memory that is not shared, received ${received}.`;
		},
	},
	FULCRO7019: {
		kind: RangeError,
		message: ({
			operation,
			address,
			start,
			end,
		}: {
			operation: string;
			address: number | string;
			start: number;
			end: number;
		}) => {
			return `${operation}: address ${String(address)} is outside ${String(start)} to ${String(end)}, where this pointer may point.`;
		},
	},
	FULCRO7020: {
		kind: RangeError,
		message: ({
			operation,
			address,
			alignment,
			element,
		}: {
			operation: string;
			address: number;
			alignment: number;
			element: string;
		}) => {
			return `${operation}: address ${String(address)} is not a multiple of ${String(alignment)}, where a value of ${element} may start.`;
		},
	},
	FULCRO7021: {
		kind: RangeError,
		message: ({
			operation,
			address,
			size,
			element,
			end,
		}: {
			operation: string;
			address: number;
			size: number;
			element: string;
			end: number;
		}) => {
			return `${operation}: the ${String(size)} bytes of ${element} at address ${String(address)} run past ${String(end)}, the end of where this pointer may read.`;
		},
	},
	FULCRO7022: {
		kind: TypeError,
		message: ({ operation, received }: { operation: string; received: string }) => {
			return `${operation}: expected a linear memory or an allocation, received ${received}.`;
		},
	},
	FULCRO7023: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the owner was moved; use the owner move returned.`;
		},
	},
	FULCRO7024: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the borrow has ended — its owner was moved or disposed, or borrowed again in a way it cannot share; borrow again.`;
		},
	},
	FULCRO7025: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the storage already has an owner, and a storage is owned once.`;
		},
	},
	FULCRO7026: {
		kind: TypeError,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: create returned a borrow, which reaches memory another owner holds; create a storage instead.`;
		},
	},
	FULCRO7027: {
		kind: Error,
		message: ({ operation, name, line }: { operation: string; name: string; line: number }) => {
			return `${operation}: '${name}' is used after it was moved at line ${String(line)}; use the owner move returned.`;
		},
	},
	FULCRO7028: {
		kind: Error,
		message: ({
			operation,
			name,
			owner,
			conflict,
			line,
		}: {
			operation: string;
			name: string;
			owner: string;
			conflict: string;
			line: number;
		}) => {
			return `${operation}: the borrow '${name}' is used after ${conflict}(${owner}) at line ${String(line)} ended it.`;
		},
	},
	FULCRO7029: {
		kind: Error,
		message: ({
			operation,
			name,
			owner,
			line,
		}: {
			operation: string;
			name: string;
			owner: string;
			line: number;
		}) => {
			return `${operation}: the borrow '${name}' is used after its owner '${owner}' was moved at line ${String(line)}.`;
		},
	},
	FULCRO7030: {
		kind: Error,
		message: ({ operation }: { operation: string }) => {
			return `${operation}: the owner was disposed when its scope ended; nothing can be borrowed or moved from it any more.`;
		},
	},
} as const satisfies RangeCatalog<'7'>;
