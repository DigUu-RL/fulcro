/**
 * Fixture compiled by the `createEquals` suite.
 *
 * Never imported at runtime. Every line ending in the refusal marker must be
 * refused by the compiler, and nothing else may be: the suite reads the markers
 * and asserts the report lands on exactly those lines. Excluded from the
 * tsconfig of this package, so `npm run typecheck` does not trip over errors
 * that are the point.
 *
 * Imported by package name, so the compilers check it against the declarations
 * the package publishes — what a consumer compiles against.
 */
import { createEquals, type EqualityRule, type Equals, equals } from '@fulcro/functions';

interface Pilot {
	readonly id: number;
	readonly name: string;
}

/** A descriptor, declared with methods as those of `@fulcro/types` are. */
interface Descriptor<T> {
	is(value: unknown): value is T;
	equals(left: T, right: T): boolean;
}

declare const redSquadron: readonly Pilot[];
declare const goldSquadron: readonly Pilot[];
declare const SensorContact: Descriptor<{ readonly bearing: number }>;

/** Two numbers. Must compile. */
export const numbers: boolean = equals(1, 2);

/** Two values of one declared type. Must compile. */
export const sameType: boolean = equals(redSquadron, goldSquadron);

/** A rule over one type, its parameters inferred from it. Must compile. */
export const byId: EqualityRule<Pilot> = {
	is: (value): value is Pilot => typeof value === 'object' && value !== null && 'id' in value,
	equals: (left, right) => left.id === right.id,
};

/** Rules over different types, a descriptor among them. Must compile. */
export const variant: Equals = createEquals([byId, SensorContact]);

/** A variant takes the place of `equals`. Must compile. */
export const fromVariant: boolean = variant(redSquadron, goldSquadron);

/** A number and a string can never be equal. */
export const mixed: boolean = equals(1, 'Red One'); // refused

/** A rule needs `equals`. */
export const missing: Equals = createEquals([{ is: (value) => value === 1 }]); // refused

/** A rule's members are functions. */
export const notFunction: Equals = createEquals([{ is: 1, equals: () => true }]); // refused
