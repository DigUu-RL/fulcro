import { describe, expect, expectTypeOf, it } from 'vitest';

import { borrow } from '@/borrow';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { own } from '@/own';
import type { Owned } from '@/owned';
import type { Storage } from '@/storage';

import { coded } from './coded';

/**
 * Behaviour suite for `own`, and for the `Owned<T>` it returns.
 *
 * An owner is made from a function that creates its storage, so that nothing
 * else is left holding the storage, and a storage has one owner.
 */

describe('own', () => {
	it('should own the storage it creates, at its length', () => {
		const scores: Owned<number> = own(() => createManagedStorage(5, 1));

		expect(scores.length).toBe(5);
		expect(borrow(scores).get(4)).toBe(1);
	});

	it('should call create exactly once', () => {
		let calls = 0;

		own(() => {
			calls++;

			return createManagedStorage(1, 0);
		});

		expect(calls).toBe(1);
	});

	it('should own a storage written outside the package', () => {
		const values: number[] = [3, 4];
		const outside: Storage<number> = {
			length: 2,
			get: (index: number): number => values[index] as number,
			set: (index: number, value: number): void => {
				values[index] = value;
			},
		};
		const owner: Owned<number> = own(() => outside);

		borrowMutable(owner).set(0, 9);

		expect(values).toEqual([9, 4]);
	});

	it('should be frozen, with nothing but its length to ask of it', () => {
		const owner: Owned<string> = own(() => createManagedStorage(2, ''));

		expect(Object.isFrozen(owner)).toBe(true);
		expect(Object.keys(owner)).toEqual(['length']);
	});

	it('should refuse a storage that already has an owner', () => {
		const storage: Storage<number> = createManagedStorage(1, 0);

		own(() => storage);

		expect(() => own(() => storage)).toThrow(
			coded(
				new Error(
					'FULCRO7025: own: the storage already has an owner, and a storage is owned once.',
				),
				{ operation: 'own' },
			),
		);
	});

	it('should refuse to own a borrow', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));
		const lent = borrowMutable(owner);

		expect(() => own(() => lent)).toThrow(
			coded(
				new TypeError(
					'FULCRO7026: own: create returned a borrow, which reaches memory another owner holds; create a storage instead.',
				),
				{ operation: 'own' },
			),
		);
	});

	it('should refuse something that is not a function', () => {
		expect(() => own(3 as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7017: own: expected a function that creates a storage, received number.',
				),
				{
					operation: 'own',
					expected: 'a function that creates a storage',
					received: 'number',
				},
			),
		);
	});

	it('should refuse a create that returns no storage it can write', () => {
		const readOnly = { length: 1, get: (): number => 0 };

		expect(() => own(() => readOnly as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7017: own: expected a storage with length, get and set, received object.',
				),
				{
					operation: 'own',
					expected: 'a storage with length, get and set',
					received: 'object',
				},
			),
		);
		expect(() => own(() => null as never)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7017',
				details: expect.objectContaining({ received: 'null' }),
			}),
		);
	});

	it('should infer the type of the values from the storage created', () => {
		expectTypeOf(own(() => createManagedStorage(1, 0))).toEqualTypeOf<
			Owned<number>
		>();
		expectTypeOf(own(() => createManagedStorage(1, 'a'))).toEqualTypeOf<
			Owned<string>
		>();
	});

	it('should not take a plain object with a length for an owner', () => {
		expectTypeOf<{ length: number }>().not.toExtend<Owned<number>>();
		expectTypeOf<Owned<number>>().not.toExtend<Owned<string>>();
	});
});
