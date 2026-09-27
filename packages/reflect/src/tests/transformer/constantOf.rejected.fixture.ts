import { constantOf } from '@fulcro/reflect';

// Every call here reads something the transformer cannot prove constant, or
// produces something a literal cannot write; each has to be refused at its own
// line, and none may reach the output as a literal.

let counter = 0;

counter++;

class Holder {}

export const fromLet = constantOf(() => counter);

export const fromParameter = (value: number): number => constantOf(() => value);

export const fromDate = constantOf(() => Date.now());

export const fromProcess = constantOf(() => process.pid);

export const fromClass = constantOf(() => Holder.name);

export const thrown = constantOf((): number => {
	throw new RangeError('refused on purpose');
});

export const random = constantOf(() => Math.random());

export const unwritable = constantOf(() => new Map() as never);

export const notAFunction = constantOf(3 as never);

export const dependsOnRefused = constantOf(() => fromLet + 1);
