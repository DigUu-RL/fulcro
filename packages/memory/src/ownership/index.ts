import { createError } from '@fulcro/errors';

import type { Owned } from '@/owned';
import { type Source, storageSource } from '@/source';
import type { Storage } from '@/storage';

/**
 * What one owned storage, its current owner and its borrows share.
 *
 * Borrows are not tracked one by one. Each remembers the generation it was
 * taken in, and ending borrows is moving the generation on: every borrow of an
 * older one is over, whatever it was, at the cost of one comparison per
 * access and no list that grows with the borrows taken.
 */
export interface Ownership<T> {
	/** The storage owned. */
	readonly storage: Storage<T>;

	/** The storage as a source, built once rather than per borrow. */
	readonly source: Source<T>;

	/** Moves on whenever the borrows taken so far end. */
	generation: number;

	/** Whether the borrow of the current generation is the exclusive one. */
	exclusive: boolean;

	/** The one handle that may act for the storage now. */
	owner: object | null;
}

/**
 * The state behind each owner handle.
 *
 * Module-level on purpose: a handle is a frozen object with nothing to hold
 * the state in, and the borrow functions have to reach it from the handle.
 * Weak, so a handle nobody holds any more takes its entry with it. Two
 * installed copies of this package keep two of these, and an owner from one
 * is refused by the other as not being an owner.
 *
 * Held as `unknown`: an ownership of `T` writes values of `T`, so it is not an
 * ownership of `unknown`, and the one place reading it back knows its `T`.
 */
const ownerships = new WeakMap<object, unknown>();

/**
 * Every storage that has had an owner, so a second `own` of one is refused.
 * Weak, for the same reason.
 */
const ownedStorages = new WeakSet<object>();

/**
 * Every borrow handed out, so `own` refuses to make an owner of one. Weak, for
 * the same reason.
 */
const borrows = new WeakSet<object>();

/**
 * Every owner disposed while it was the current one, so using it afterwards
 * is refused as disposed rather than as moved. Weak, for the same reason.
 */
const disposedOwners = new WeakSet<object>();

/**
 * Records that a storage now has an owner.
 *
 * @param operation Operation being performed, for the error message.
 * @param storage The storage.
 * @throws {Error} When the storage already had one.
 */
export const claimStorage = (operation: string, storage: object): void => {
	if (ownedStorages.has(storage)) {
		throw createError('FULCRO7025', { operation });
	}

	ownedStorages.add(storage);
};

/**
 * Records a borrow handed out.
 *
 * @param borrow The borrow.
 * @returns The same borrow.
 */
export const recordBorrow = <T extends object>(borrow: T): T => {
	borrows.add(borrow);

	return borrow;
};

/**
 * Tells whether a value is a borrow handed out by this package.
 *
 * @param value Value to look at.
 * @returns `true` for a borrow.
 */
export const isBorrow = (value: unknown): boolean =>
	typeof value === 'object' && value !== null && borrows.has(value);

/**
 * Makes the handle that owns a storage now, and spends the one before it.
 *
 * @param state What the storage's owners and borrows share.
 * @returns The new owner, frozen.
 */
export const createOwned = <T>(state: Ownership<T>): Owned<T> => {
	// A getter rather than a value, so that asking a spent owner for its
	// length is refused like anything else asked of it.
	const handle: object = Object.freeze({
		get length(): number {
			return requireOwnership('Owned.length', handle).storage.length;
		},

		// A handle that was moved from is not the owner any more, so the end of
		// its scope has nothing to end: the owner `move` returned keeps its
		// borrows. Disposing twice is disposing once, as for any disposable.
		[Symbol.dispose]: (): void => {
			if (state.owner !== handle) return;

			endBorrows(state, false);
			state.owner = null;
			disposedOwners.add(handle);
		},
	});

	state.owner = handle;
	ownerships.set(handle, state);

	// The mark on `Owned<T>` is a type and nothing else; there is no value to
	// give it, so the handle is the type only by declaration.
	return handle as Owned<T>;
};

/**
 * Starts the ownership of a storage.
 *
 * @param storage The storage, already claimed.
 * @returns What its owners and borrows will share.
 */
export const createOwnership = <T>(storage: Storage<T>): Ownership<T> => ({
	storage,
	source: storageSource(storage),
	generation: 0,
	exclusive: false,
	owner: null,
});

/**
 * Finds the state behind an owner, refusing a spent one.
 *
 * @param operation Operation being performed, for the error message.
 * @param owner What was handed in as an owner.
 * @returns Its state.
 * @throws {TypeError} When the value is not an owner made by `own` or `move`.
 * @throws {Error} When the owner was moved or disposed.
 */
export const requireOwnership = <T>(
	operation: string,
	owner: unknown,
): Ownership<T> => {
	const state = (
		typeof owner === 'object' && owner !== null
			? ownerships.get(owner)
			: undefined
	) as Ownership<T> | undefined;

	if (state === undefined) {
		throw createError('FULCRO7017', {
			operation,
			expected: 'an owner from own or move',
			received: owner === null ? 'null' : typeof owner,
		});
	}

	if (state.owner !== owner) {
		throw createError(
			disposedOwners.has(owner as object) ? 'FULCRO7030' : 'FULCRO7023',
			{ operation },
		);
	}

	return state;
};

/**
 * Ends every borrow taken so far.
 *
 * @template T Type of the values owned.
 * @param state The ownership.
 * @param exclusive Whether the borrow about to be taken is the exclusive one.
 */
export const endBorrows = <T>(
	state: Ownership<T>,
	exclusive: boolean,
): void => {
	state.generation++;
	state.exclusive = exclusive;
};

/**
 * The owned storage as a borrow reaches it: every access first checks that
 * the borrow's generation is still the current one.
 *
 * The check lives in the source rather than on the borrow, because a subview
 * and a read-only view are cut from the source, not from the view they came
 * from — a check on the borrow's own `get` would not survive `subview()`.
 *
 * @param state The ownership.
 * @returns The source, for the current generation.
 */
export const borrowedSource = <T>(state: Ownership<T>): Source<T> => {
	const generation: number = state.generation;

	/**
	 * Refuses an access once the borrow has ended.
	 *
	 * @param operation Operation being performed, for the error message.
	 */
	const requireCurrent = (operation: string): void => {
		if (state.generation !== generation) {
			throw createError('FULCRO7024', { operation });
		}
	};

	return Object.freeze({
		length: state.source.length,
		read: (operation: string, index: number): T => {
			requireCurrent(operation);

			return state.source.read(operation, index);
		},
		write: (operation: string, index: number, value: T): void => {
			requireCurrent(operation);
			state.source.write(operation, index, value);
		},
	});
};
