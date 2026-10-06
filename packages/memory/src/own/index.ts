import { createError } from '@fulcro/errors';

import type { Owned } from '@/owned';
import {
	claimStorage,
	createOwned,
	createOwnership,
	isBorrow,
} from '@/ownership';
import type { Storage } from '@/storage';

/**
 * Tells whether a value has the shape of a storage that can be written.
 *
 * @param value Value to look at.
 * @returns `true` for an object with a numeric `length`, a `get` and a `set`.
 */
const isStorage = (value: unknown): value is Storage<unknown> => {
	if (typeof value !== 'object' || value === null) return false;

	const candidate = value as Partial<Record<string, unknown>>;

	return (
		typeof candidate.length === 'number' &&
		typeof candidate.get === 'function' &&
		typeof candidate.set === 'function'
	);
};

/**
 * Creates a storage and makes its owner, so that from then on its values are
 * reached only through borrows.
 *
 * ```ts
 * const scores: Owned<number> = own(() => createManagedStorage(100, 0));
 * const particles = own(() => allocate(Particle, 10_000, arena));
 * ```
 *
 * The storage is created inside `create` rather than handed in, so that no
 * other way to reach it is left behind: there is no variable holding the
 * storage itself to read or write around the borrows. A storage `create`
 * returns from somewhere else — a variable, a view made over it earlier —
 * stays reachable that way, and those accesses are not checked.
 *
 * A storage has one owner. Returning one that already has an owner, or a
 * borrow of one, is refused.
 *
 * @template T Type of the values, inferred from the storage created.
 * @param create Creates the storage to own.
 * @returns The owner, frozen.
 * @throws {TypeError} When `create` is not a function, returns something that
 * is not a storage with `get` and `set`, or returns a borrow.
 * @throws {Error} When the storage it returns already has an owner.
 */
export const own = <T>(create: () => Storage<T>): Owned<T> => {
	if (typeof create !== 'function') {
		throw createError('FULCRO7017', {
			operation: 'own',
			expected: 'a function that creates a storage',
			received: create === null ? 'null' : typeof create,
		});
	}

	const storage: unknown = create();

	if (isBorrow(storage)) throw createError('FULCRO7026', { operation: 'own' });

	if (!isStorage(storage)) {
		throw createError('FULCRO7017', {
			operation: 'own',
			expected: 'a storage with length, get and set',
			received: storage === null ? 'null' : typeof storage,
		});
	}

	claimStorage('own', storage);

	return createOwned(createOwnership(storage as Storage<T>));
};
