import { describe, expect, it } from 'vitest';

import { createManagedStorage } from '@/managedStorage';
import type { Storage } from '@/storage';

/**
 * Performance suite for `createManagedStorage`.
 *
 * Counted, never timed (`docs/testing.md`). The values are proxies that count
 * every access made to them: a storage that holds values as they are never
 * looks inside one — not to copy it, not to compare it, not to check it — so
 * the count stays at zero however many are held and moved.
 */

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

interface Order {
	readonly id: number;
	readonly region: string;
	readonly total: number;
}

/**
 * An order that counts how often anything inside it is touched.
 *
 * @param id Its id.
 * @param touches Counter to increment.
 * @returns The order, behind a counting proxy.
 */
const watchedOrder = (id: number, touches: { count: number }): Order =>
	new Proxy(
		{ id, region: 'north', total: id * 2 },
		{
			get: (target, key, receiver) => {
				touches.count++;

				return Reflect.get(target, key, receiver);
			},
			ownKeys: (target) => {
				touches.count += 1_000;

				return Reflect.ownKeys(target);
			},
			getPrototypeOf: (target) => {
				touches.count++;

				return Reflect.getPrototypeOf(target);
			},
		},
	);

describe('createManagedStorage, counted', () => {
	it('should not look inside the initial value, however long it is', () => {
		const touches = { count: 0 };

		createManagedStorage(VOLUME, watchedOrder(0, touches));

		expect(touches.count).toBe(0);
	});

	it('should not look inside a value it holds or hands back', () => {
		const touches = { count: 0 };
		const orders: Storage<Order | null> = createManagedStorage<Order | null>(
			VOLUME,
			null,
		);

		for (let index = 0; index < VOLUME; index++) {
			orders.set(index, watchedOrder(index, touches));
		}

		let handedBack = 0;

		for (let index = 0; index < VOLUME; index++) {
			if (orders.get(index) !== null) handedBack++;
		}

		expect(handedBack).toBe(VOLUME);
		expect(touches.count).toBe(0);
	});
});
