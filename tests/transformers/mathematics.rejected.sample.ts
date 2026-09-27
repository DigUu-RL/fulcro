import { constantOf } from '@fulcro/reflect';
import { Matrix, SinglePrecisionFloat } from '@fulcro/types';

/**
 * Fixture of `mathematics.spec.mts`: a constant reading a function of another
 * package. A consumer's compiler sees `@fulcro/types` only as declarations, so
 * nothing about `Matrix` can be proved constant, and the call has to be
 * refused at compile time rather than left to run later.
 */

export const identity = constantOf(() => [
	...Matrix(SinglePrecisionFloat, 2, 2).identity(),
]);
