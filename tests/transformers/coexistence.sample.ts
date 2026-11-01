import { SequenceCollection } from '@fulcro/collections';
import {
	allocate,
	borrow,
	borrowMutable,
	createManagedAllocator,
	createManagedStorage,
	move,
	own,
} from '@fulcro/memory';
import { as, defaultOf, is, nameOf, typeOf } from '@fulcro/reflect';
import { SignedInteger } from '@fulcro/types';

/**
 * Fixture compiled by the coexistence suite.
 *
 * Never imported at runtime. It exists to be fed to a compiler with **all
 * three** plugins applied, which is what a consumer using the libraries
 * together gets and what nothing else in this repository exercises: each
 * package tests its own transformer alone.
 *
 * Every package is imported by name, so the program resolves them through
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
export const filtered = (): Order[] => SequenceCollection.from(rows).ofType<Order>().toArray();

export const checked = (): Order[] => SequenceCollection.from(rows).cast<Order>().toArray();

/** Both in one expression, which is where interference would show. */
export const together = (): Order[] =>
	SequenceCollection.from(rows)
		.ofType<Order>()
		.where((order) => is<Order>(order))
		.toArray();

/**
 * Checked by `@fulcro/memory`, legally, with a call of each of the others
 * inside the borrows — so the analysis and both rewriters meet the same nodes.
 */
export const owned = (): boolean => {
	const orders = own(() => createManagedStorage<unknown>(1, payload));

	borrowMutable(orders).set(0, defaultOf<Order>());

	const reading = borrow(move(orders));
	const first: unknown = reading.get(0);

	return (
		is<Order>(first) && SequenceCollection.from([first]).ofType<Order>().toArray().length === 1
	);
};

const Integer = SignedInteger(32);
const managed = createManagedAllocator();

/**
 * Rewritten by `@fulcro/memory` as a statement — a storage that cannot outlive
 * its block moves into a frame — in a block whose calls the other two rewrite,
 * one of them inside the very declaration it moves.
 */
export const scoped = (): number => {
	const counts = allocate(Integer, nameOf<Order>().length, managed);

	counts.set(0, Integer.from(SequenceCollection.from(rows).ofType<Order>().toArray().length));

	return is<Order>(payload) ? counts.get(0) : counts.length;
};
