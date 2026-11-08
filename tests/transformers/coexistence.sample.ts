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
export interface DockingRecord {
	readonly id: number;
	readonly region: string;
}

declare const payload: unknown;
declare const rows: unknown[];

/** Claimed by `@fulcro/reflect`, as a free function. */
export const guarded = (): boolean => is<DockingRecord>(payload);

export const asserted = (): DockingRecord => as<DockingRecord>(payload);

export const empty = (): DockingRecord => defaultOf<DockingRecord>();

export const named = (): string => nameOf<DockingRecord>();

export const described = (): unknown => typeOf(payload).declared;

/** Claimed by `@fulcro/collections`, as methods on a sequence. */
export const filtered = (): DockingRecord[] =>
	SequenceCollection.from(rows).ofType<DockingRecord>().toArray();

export const checked = (): DockingRecord[] =>
	SequenceCollection.from(rows).cast<DockingRecord>().toArray();

/** Both in one expression, which is where interference would show. */
export const together = (): DockingRecord[] =>
	SequenceCollection.from(rows)
		.ofType<DockingRecord>()
		.where((arrival) => is<DockingRecord>(arrival))
		.toArray();

/**
 * Checked by `@fulcro/memory`, legally, with a call of each of the others
 * inside the borrows — so the analysis and both rewriters meet the same nodes.
 */
export const owned = (): boolean => {
	const arrivals = own(() => createManagedStorage<unknown>(1, payload));

	borrowMutable(arrivals).set(0, defaultOf<DockingRecord>());

	const reading = borrow(move(arrivals));
	const first: unknown = reading.get(0);

	return (
		is<DockingRecord>(first) &&
		SequenceCollection.from([first]).ofType<DockingRecord>().toArray().length === 1
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
	const counts = allocate(Integer, nameOf<DockingRecord>().length, managed);

	counts.set(
		0,
		Integer.from(SequenceCollection.from(rows).ofType<DockingRecord>().toArray().length),
	);

	return is<DockingRecord>(payload) ? counts.get(0) : counts.length;
};
