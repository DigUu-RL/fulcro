import { describe, expect, expectTypeOf, it } from 'vitest';

import { asReadOnlyView } from '@/asReadOnlyView';
import { borrow } from '@/borrow';
import type { Borrowed } from '@/borrowed';
import { createManagedStorage } from '@/managedStorage';
import { own } from '@/own';
import type { Owned } from '@/owned';
import { pointerTo } from '@/pointerTo';
import type { ReadOnlyView } from '@/view';

import { coded } from './coded';

/**
 * Behaviour suite for `borrow`, and for the `Borrowed<T>` it returns.
 *
 * A shared borrow reads an owner's values in place, and any number of them
 * read at once. What ends one is refused in `borrow.unchecked.spec.ts`, which
 * runs without the transformer that would refuse it first.
 */

/**
 * An owner of `0, 1, 2, …`.
 *
 * @param length How many values.
 * @returns The owner.
 */
const counting = (length: number): Owned<number> =>
	own(() => {
		const storage = createManagedStorage(length, 0);

		for (let index = 0; index < length; index++) storage.set(index, index);

		return storage;
	});

describe('borrow', () => {
	it('should read every value of the owner, in place', () => {
		const owner: Owned<number> = counting(4);
		const values: Borrowed<number> = borrow(owner);

		expect(values.length).toBe(4);
		expect([0, 1, 2, 3].map((index) => values.get(index))).toEqual([
			0, 1, 2, 3,
		]);
	});

	it('should let shared borrows of one owner read at once', () => {
		const owner: Owned<number> = counting(3);
		const first: Borrowed<number> = borrow(owner);
		const second: Borrowed<number> = borrow(owner);

		expect(first.get(2) + second.get(1)).toBe(3);
		expect(first.get(0)).toBe(0);
	});

	it('should observe part of the values through a subview', () => {
		const values: Borrowed<number> = borrow(counting(10));

		expect(values.subview(4, 3).subview(1).get(1)).toBe(6);
	});

	it('should be a read-only view, with nothing to write through', () => {
		const values: Borrowed<number> = borrow(counting(2));

		expect('set' in values).toBe(false);
		expect(Object.isFrozen(values)).toBe(true);
		expect(asReadOnlyView(values, 1).get(0)).toBe(1);
		// A pointer can write, so it is refused over a borrow that cannot.
		expect(() => pointerTo(values as never, 1)).toThrow(
			expect.objectContaining({ code: 'FULCRO7017' }),
		);
	});

	it('should refuse an index outside, as any view does', () => {
		expect(() => borrow(counting(2)).get(2)).toThrow(
			expect.objectContaining({ code: 'FULCRO7002' }),
		);
	});

	it('should refuse something that is not an owner', () => {
		expect(() => borrow({ length: 1 } as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7017: borrow: expected an owner from own or move, received object.',
				),
				{
					operation: 'borrow',
					expected: 'an owner from own or move',
					received: 'object',
				},
			),
		);
	});

	it('should infer the type of the values, and be accepted as a read-only view', () => {
		expectTypeOf(borrow(counting(1))).toEqualTypeOf<Borrowed<number>>();
		expectTypeOf<Borrowed<number>>().toExtend<ReadOnlyView<number>>();
		expectTypeOf<ReadOnlyView<number>>().not.toExtend<Borrowed<number>>();
	});
});
