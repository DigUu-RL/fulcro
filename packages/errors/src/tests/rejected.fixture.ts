import { createError } from '../createError';
import { RangeCatalog } from '../definition';

/**
 * Fixture that must not compile.
 *
 * Each statement is wrong in exactly one way the type system has to catch, and
 * the suite reads the compiler's report line by line. The package's tsconfig
 * excludes this file so its own typecheck stays clean.
 */

// A code that was never registered.
export const unregistered = createError('FULCRO1999', { operation: 'x' });

// A registered code, handed a detail of the wrong type.
export const wrongValue = createError('FULCRO1005', {
	operation: 'elementAt',
	index: 'three',
});

// A registered code, handed fewer details than its template takes.
export const missingValue = createError('FULCRO6021', {
	operation: 'Vector3.from',
});

// A code declared in the range of another package.
export const outOfRange = {
	FULCRO7001: {
		kind: Error,
		message: (_details: { operation: string }) => 'misplaced',
	},
} as const satisfies RangeCatalog<'6'>;

// A template whose details have no operation.
export const noOperation = {
	FULCRO6001: {
		kind: Error,
		message: ({ index }: { index: number }) => `${index}`,
	},
} as const satisfies RangeCatalog<'6'>;

// A template whose details hold an object, which would travel with the error.
export const objectDetail = {
	FULCRO6001: {
		kind: Error,
		message: (_details: { operation: string; source: object }) => 'held',
	},
} as const satisfies RangeCatalog<'6'>;
