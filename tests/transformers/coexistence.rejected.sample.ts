import { borrow, createManagedStorage, move, own } from '@fulcro/memory';
import { defaultOf, is } from '@fulcro/reflect';

/**
 * Fixture compiled by the coexistence suite, which `@fulcro/memory` must
 * refuse even after `@fulcro/reflect` has rewritten the calls around the
 * offending one.
 */

interface Order {
	readonly id: number;
}

export const usedAfterMove = (): boolean => {
	const orders = own(() => createManagedStorage(1, defaultOf<Order>()));

	move(orders);

	return is<Order>(borrow(orders).get(0));
};
