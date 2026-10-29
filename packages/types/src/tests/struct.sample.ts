import { SignedInteger } from '@/src/signedInteger';
import { SinglePrecisionFloat } from '@/src/singlePrecisionFloat';
import { type StructType, struct } from '@/src/struct';

/**
 * Consumer code over struct descriptors in general, checked by the package's
 * typecheck: every line has to go on compiling.
 *
 * It is a sample rather than part of `struct.spec.ts` because the descriptors
 * it accepts are spelled with `any`, the way consumers spell them, and the house
 * style keeps `any` out of the repository's own code. The last release accepted
 * every struct as a `StructType<any>`; once structs could carry methods, the
 * ones that did were refused there, and the spec could not notice, since it
 * names no descriptor that wide.
 */

const Point = struct('Point', { x: SinglePrecisionFloat, y: SinglePrecisionFloat });

const Counter = struct(
	'Counter',
	{ value: SignedInteger(32) },
	{
		increment(): number {
			return this.value + 1;
		},
	},
);

const Plain = struct('Plain', { value: SignedInteger(32) });

/** A struct of any fields, with methods or without. */
export const anyWithMethods: StructType<any> = Counter;
export const anyWithout: StructType<any> = Point;

export const recordWithMethods: StructType<Record<string, any>> = Counter;
export const recordWithout: StructType<Record<string, any>> = Point;

/** Code that works over any struct, as `docs/types.md` describes it. */
const nameOf = (descriptor: StructType<any>): string => descriptor.name;

const register = <TFields extends Record<string, any>>(descriptor: StructType<TFields>): string => {
	return descriptor.name;
};

export const named: readonly string[] = [
	nameOf(Counter),
	nameOf(Point),
	register(Counter),
	register(Point),
];

/** Fields named exactly: the methods are no part of what is asked for. */
type CounterFields = { value: ReturnType<typeof SignedInteger<32>> };

export const sameFieldsWithMethods: StructType<CounterFields> = Counter;
export const sameFieldsWithout: StructType<CounterFields> = Plain;
