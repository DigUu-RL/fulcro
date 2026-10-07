import { describe, expect, expectTypeOf, it } from 'vitest';

import { borrow } from '@/borrow';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { move } from '@/move';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { coded } from './coded';

/**
 * Behaviour suite for `move`.
 *
 * A move hands the same values to a new owner. Using the owner it came from
 * is refused in `move.unchecked.spec.ts`, which runs without the transformer
 * that would refuse it first.
 */

/**
 * Takes ownership, as a function receiving an owner by move would.
 *
 * @param owner The owner handed over.
 * @returns What it finds at position `0`.
 */
const consume = (owner: Owned<number>): number => borrow(owner).get(0);

describe('move', () => {
	it('should hand the very same values to the new owner', () => {
		const first: Owned<number> = own(() => createManagedStorage(2, 0));

		borrowMutable(first).set(0, 5);

		const second: Owned<number> = move(first);

		expect(second.length).toBe(2);
		expect(borrow(second).get(0)).toBe(5);
	});

	it('should move along a chain of owners', () => {
		let owner: Owned<number> = own(() => createManagedStorage(1, 1));

		for (let step = 0; step < 3; step++) owner = move(owner);

		expect(consume(move(owner))).toBe(1);
	});

	it('should be frozen', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 0));

		expect(Object.isFrozen(move(first))).toBe(true);
	});

	it('should refuse something that is not an owner', () => {
		expect(() => move(undefined as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7017: move: expected an owner from own or move, received undefined.',
				),
				{
					operation: 'move',
					expected: 'an owner from own or move',
					received: 'undefined',
				},
			),
		);
	});

	it('should infer the type of the values', () => {
		const owner: Owned<string> = own(() => createManagedStorage(1, ''));

		expectTypeOf(move(owner)).toEqualTypeOf<Owned<string>>();
	});
});
