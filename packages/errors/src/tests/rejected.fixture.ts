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
export const unregistered = createError('FULCRO1999');

// A registered code, handed a value of the wrong type.
export const wrongValue = createError('FULCRO1005', 'three');

// A registered code, handed fewer values than its template takes.
export const missingValue = createError('FULCRO6021', 'Vector3.from');

// A code declared in the range of another package.
export const outOfRange = {
	FULCRO7001: { kind: Error, message: () => 'misplaced' },
} as const satisfies RangeCatalog<'6'>;
