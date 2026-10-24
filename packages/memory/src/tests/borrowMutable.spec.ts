import { describe, expect, expectTypeOf, it } from 'vitest';

import { asView } from '@/src/asView';
import { borrow } from '@/src/borrow';
import type { Borrowed } from '@/src/borrowed';
import { borrowMutable } from '@/src/borrowMutable';
import { createManagedStorage } from '@/src/managedStorage';
import type { MutableBorrow } from '@/src/mutableBorrow';
import { own } from '@/src/own';
import type { Owned } from '@/src/owned';
import { pointerTo } from '@/src/pointerTo';
import type { Storage } from '@/src/storage';
import type { View } from '@/src/view';

import { coded } from './coded';

/**
 * Behaviour suite for `borrowMutable`, and for the `MutableBorrow<T>` it
 * returns.
 *
 * An exclusive borrow writes an owner's values in place. What ends one is
 * refused in `borrowMutable.unchecked.spec.ts`, which runs without the
 * transformer that would refuse it first.
 */

describe('borrowMutable', () => {
	it('should write the owned storage itself', () => {
		const values: number[] = [0, 0, 0];
		const owner: Owned<number> = own((): Storage<number> => ({
			length: 3,
			get: (index: number): number => values[index] as number,
			set: (index: number, value: number): void => {
				values[index] = value;
			},
		}));
		const scores: MutableBorrow<number> = borrowMutable(owner);

		scores.set(1, 42);

		expect(values).toEqual([0, 42, 0]);
		expect(scores.get(1)).toBe(42);
	});

	it('should hand what it wrote to the borrow taken after it', () => {
		const owner: Owned<string> = own(() => createManagedStorage(2, ''));

		borrowMutable(owner).set(0, 'written');

		const reading: Borrowed<string> = borrow(owner);

		expect(reading.get(0)).toBe('written');
	});

	it('should write through a subview, a pointer and a view made from it', () => {
		const owner: Owned<number> = own(() => createManagedStorage(6, 0));
		const scores: MutableBorrow<number> = borrowMutable(owner);

		scores.subview(2).set(0, 1);
		pointerTo(scores, 3).set(2);
		asView(scores, 4).set(0, 3);

		expect([2, 3, 4].map((index) => scores.get(index))).toEqual([1, 2, 3]);
		expect(scores.readOnly().get(4)).toBe(3);
	});

	it('should be frozen', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));

		expect(Object.isFrozen(borrowMutable(owner))).toBe(true);
	});

	it('should refuse something that is not an owner', () => {
		expect(() => borrowMutable(null as never)).toThrow(
			coded(
				new TypeError(
					'FULCRO7017: borrowMutable: expected an owner from own or move, received null.',
				),
				{
					operation: 'borrowMutable',
					expected: 'an owner from own or move',
					received: 'null',
				},
			),
		);
	});

	it('should infer the type of the values, and be accepted as a view', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));

		expectTypeOf(borrowMutable(owner)).toEqualTypeOf<MutableBorrow<number>>();
		expectTypeOf<MutableBorrow<number>>().toExtend<View<number>>();
		expectTypeOf<View<number>>().not.toExtend<MutableBorrow<number>>();
		expectTypeOf<MutableBorrow<number>>().not.toExtend<Borrowed<number>>();
	});
});
