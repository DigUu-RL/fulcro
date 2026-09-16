import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';

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

/** An interface, written out as the checks its properties imply. */
export const accounts = (): unknown =>
	SequenceCollection.from(values).ofType<Account>().toArray();

/** A record with an optional field, a nested object and an array. */
export interface Order {
	readonly id: number;
	readonly note?: string;
	readonly tags: string[];
	readonly customer: { readonly email: string };
	readonly status: 'pending' | 'paid';
	readonly placedAt: Date;
}

export const orders = (): unknown =>
	SequenceCollection.from(values).ofType<Order>().toArray();

/** A tuple of fixed length. */
export const pairs = (): unknown =>
	SequenceCollection.from(values).ofType<[string, number]>().toArray();

/** A union of literals. */
export const statuses = (): unknown =>
	SequenceCollection.from(values).ofType<'pending' | 'paid'>().toArray();

/** Recursive: written as a function that calls itself. */
export interface Tree {
	readonly value: number;
	readonly children: Tree[];
}

export const trees = (): unknown =>
	SequenceCollection.from(values).ofType<Tree>().toArray();

/** Mutually recursive, where the cycle runs through a second type. */
export interface Author {
	readonly name: string;
	readonly posts: Post[];
}

export interface Post {
	readonly title: string;
	readonly author: Author;
}

export const authors = (): unknown =>
	SequenceCollection.from(values).ofType<Author>().toArray();

/**
 * An index signature: still refused, and deliberately. Arbitrary keys mean
 * there is no fixed set of properties to write checks for.
 */
export interface Settings {
	readonly [key: string]: string;
}

export const settings = (): unknown =>
	SequenceCollection.from(values).ofType<Settings>().toArray();

/**
 * The asynchronous sequence, which declares the same two operators in a
 * sibling module — the case a segment naming only `sequence` would miss.
 */
const streamed = async function* (): AsyncGenerator<unknown> {
	yield* values;
};

export const streamedOrders = (): unknown =>
	AsyncSequenceCollection.from(streamed()).cast<Order>();

export const streamedStrings = (): unknown =>
	AsyncSequenceCollection.from(streamed()).ofType<string>();
