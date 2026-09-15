import { SequenceCollection } from '@fulcro/collections';

/**
 * Fixture compiled by the transformer suite.
 *
 * Never imported at runtime: it exists to be fed to a compiler with the plugin
 * applied, so the emitted JavaScript can be asserted on. It imports
 * `@fulcro/collections` **by name**, so the program resolves it through
 * `node_modules` into the built declarations of the package — which is the only
 * place the method recognition could break, since a rewriter identifies a call
 * by the module that declares it.
 */

/** A class, which has a runtime counterpart the rewriter can reference. */
export class Admin {
	constructor(public readonly name: string) {}
}

/** An interface, which leaves nothing behind and cannot be resolved. */
export interface Account {
	readonly id: number;
}

const values: unknown[] = ['a', 1, new Admin('root')];

/** The primitive form, which becomes a `typeof` name. */
export const strings = (): unknown =>
	SequenceCollection.from(values).ofType<string>().toArray();

/** The class form, which becomes a reference to the constructor. */
export const admins = (): unknown =>
	SequenceCollection.from(values).ofType<Admin>().toArray();

/** The same two, through `cast`. */
export const castStrings = (): unknown =>
	SequenceCollection.from(['a', 'b']).cast<string>().toArray();

export const castAdmins = (): unknown =>
	SequenceCollection.from([new Admin('root')])
		.cast<Admin>()
		.toArray();

/** Written with a token already: nothing for the transformer to fill in. */
export const explicit = (): unknown =>
	SequenceCollection.from(values).ofType('number').toArray();

/** Chained, so one rewritten call sits inside another. */
export const chained = (): unknown =>
	SequenceCollection.from(values).ofType<string>().cast<string>().toArray();

/** Unresolvable: an interface has no runtime form, so this is left alone. */
export const accounts = (): unknown =>
	SequenceCollection.from(values).ofType<Account>().toArray();
