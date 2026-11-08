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
export class Jedi {
	constructor(public readonly name: string) {}
}

/** An interface, which leaves nothing behind and cannot be resolved. */
export interface RebelCell {
	readonly id: number;
}

const values: unknown[] = ['a', 1, new Jedi('Yoda')];

/** The primitive form, which becomes a `typeof` name. */
export const strings = (): unknown => SequenceCollection.from(values).ofType<string>().toArray();

/** The class form, which becomes a reference to the constructor. */
export const jedi = (): unknown => SequenceCollection.from(values).ofType<Jedi>().toArray();

/** The same two, through `cast`. */
export const castStrings = (): unknown =>
	SequenceCollection.from(['a', 'b']).cast<string>().toArray();

export const castJedi = (): unknown =>
	SequenceCollection.from([new Jedi('Yoda')])
		.cast<Jedi>()
		.toArray();

/** Written with a token already: nothing for the transformer to fill in. */
export const explicit = (): unknown => SequenceCollection.from(values).ofType('number').toArray();

/** Chained, so one rewritten call sits inside another. */
export const chained = (): unknown =>
	SequenceCollection.from(values).ofType<string>().cast<string>().toArray();

/** An interface, written out as the checks its properties imply. */
export const rebelCells = (): unknown =>
	SequenceCollection.from(values).ofType<RebelCell>().toArray();

/** A record with an optional field, a nested object and an array. */
export interface DockingRecord {
	readonly id: number;
	readonly note?: string;
	readonly tags: string[];
	readonly captain: { readonly callSign: string };
	readonly status: 'docked' | 'refuelled';
	readonly arrivedAt: Date;
}

export const arrivals = (): unknown =>
	SequenceCollection.from(values).ofType<DockingRecord>().toArray();

/** A tuple of fixed length. */
export const pairs = (): unknown =>
	SequenceCollection.from(values).ofType<[string, number]>().toArray();

/** A union of literals. */
export const statuses = (): unknown =>
	SequenceCollection.from(values).ofType<'docked' | 'refuelled'>().toArray();

/** Recursive: written as a function that calls itself. */
export interface JediLineage {
	readonly value: number;
	readonly children: JediLineage[];
}

export const trees = (): unknown => SequenceCollection.from(values).ofType<JediLineage>().toArray();

/** Mutually recursive, where the cycle runs through a second type. */
export interface Senator {
	readonly name: string;
	readonly posts: Decree[];
}

export interface Decree {
	readonly title: string;
	readonly author: Senator;
}

export const authors = (): unknown => SequenceCollection.from(values).ofType<Senator>().toArray();

/**
 * An index signature: still refused, and deliberately. Arbitrary keys mean
 * there is no fixed set of properties to write checks for.
 */
export interface Garrison {
	readonly [key: string]: string;
}

export const settings = (): unknown => SequenceCollection.from(values).ofType<Garrison>().toArray();

/**
 * The asynchronous sequence, which declares the same two operators in a
 * sibling module — the case a segment naming only `sequence` would miss.
 */
const streamed = async function* (): AsyncGenerator<unknown> {
	yield* values;
};

export const streamedArrivals = (): unknown =>
	AsyncSequenceCollection.from(streamed()).cast<DockingRecord>();

export const streamedStrings = (): unknown =>
	AsyncSequenceCollection.from(streamed()).ofType<string>();
