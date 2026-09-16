import { SequenceCollection } from '@fulcro/collections';
import { as, defaultOf, is, nameOf, typeOf } from '@fulcro/reflect';

/**
 * Fixture compiled by the coexistence suite.
 *
 * Never imported at runtime. It exists to be fed to a compiler with **both**
 * plugins applied, which is what a consumer using both libraries gets and what
 * nothing else in this repository exercises: each package tests its own
 * transformer alone.
 *
 * Both packages are imported by name, so the program resolves them through
 * `node_modules` into their built declarations — the only place the recognition
 * could break, since a rewriter claims a call by the module that declares it.
 */

/** The type every call below is resolved against. */
export interface Order {
	readonly id: number;
	readonly region: string;
}

declare const payload: unknown;
declare const rows: unknown[];

/** Claimed by `@fulcro/reflect`, as a free function. */
export const guarded = (): boolean => is<Order>(payload);

export const asserted = (): Order => as<Order>(payload);

export const empty = (): Order => defaultOf<Order>();

export const named = (): string => nameOf<Order>();

export const described = (): unknown => typeOf(payload).declared;

/** Claimed by `@fulcro/collections`, as methods on a sequence. */
export const filtered = (): Order[] =>
	SequenceCollection.from(rows).ofType<Order>().toArray();

export const checked = (): Order[] =>
	SequenceCollection.from(rows).cast<Order>().toArray();

/** Both in one expression, which is where interference would show. */
export const together = (): Order[] =>
	SequenceCollection.from(rows)
		.ofType<Order>()
		.where((order) => is<Order>(order))
		.toArray();
