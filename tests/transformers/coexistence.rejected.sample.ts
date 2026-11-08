import { borrow, createManagedStorage, move, own } from '@fulcro/memory';
import { defaultOf, is } from '@fulcro/reflect';

/**
 * Fixture compiled by the coexistence suite, which `@fulcro/memory` must
 * refuse even after `@fulcro/reflect` has rewritten the calls around the
 * offending one.
 */

interface DockingRecord {
	readonly id: number;
}

export const usedAfterMove = (): boolean => {
	const arrivals = own(() => createManagedStorage(1, defaultOf<DockingRecord>()));

	move(arrivals);

	return is<DockingRecord>(borrow(arrivals).get(0));
};
