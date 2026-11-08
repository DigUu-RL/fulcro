import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/src/allocate';
import { borrow } from '@/src/borrow';
import type { Borrowed } from '@/src/borrowed';
import { borrowMutable } from '@/src/borrowMutable';
import { createManagedStorage } from '@/src/managedStorage';
import { move } from '@/src/move';
import type { MutableBorrow } from '@/src/mutableBorrow';
import { own } from '@/src/own';
import type { Owned } from '@/src/owned';
import { pointerTo } from '@/src/pointerTo';
import { createStackAllocator } from '@/src/stackAllocator';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for `Owned<T>[Symbol.dispose]`: the ownership ending with
 * the scope that declared it with `using`.
 *
 * Disposing ends every borrow and spends the owner; disposing an owner already
 * moved from does nothing, so the owner `move` returned keeps its borrows.
 * Using a moved-from owner is in `owned.unchecked.spec.ts`, which runs without
 * the transformer that would refuse it first.
 */

/** The error a disposed owner throws, for an operation. */
const disposed = (operation: string): Error => {
	return coded(
		new Error(
			`FULCRO7030: ${operation}: the owner was disposed when its scope ended; nothing can be borrowed or moved from it any more.`,
		),
		{ operation },
	);
};

/** The error an ended borrow throws, for an operation. */
const ended = (operation: string): Error => {
	return coded(
		new Error(
			`FULCRO7024: ${operation}: the borrow has ended — its owner was moved or disposed, or borrowed again in a way it cannot share; borrow again.`,
		),
		{ operation },
	);
};

const BlasterBolt = struct('BlasterBolt', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});

describe('Owned[Symbol.dispose]', () => {
	it('should end every borrow when the using scope ends', () => {
		let writing: MutableBorrow<number> | undefined;

		{
			using shieldGrid = own(() => createManagedStorage(3, 0));

			writing = borrowMutable(shieldGrid);
			writing.set(0, 7);

			expect(writing.get(0)).toBe(7);
		}

		expect(() => writing.get(0)).toThrow(ended('View.get'));

		expect(() => {
			writing.set(0, 1);
		}).toThrow(ended('View.set'));
	});

	it('should end what was cut from a borrow as well', () => {
		const shieldGrid: Owned<number> = own(() => createManagedStorage(4, 1));
		const writing: MutableBorrow<number> = borrowMutable(shieldGrid);
		const subview = writing.subview(1, 2);
		const readOnly = writing.readOnly();
		const pointer = pointerTo(writing, 2);

		shieldGrid[Symbol.dispose]();

		expect(() => subview.get(0)).toThrow(ended('View.get'));
		expect(() => readOnly.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => pointer.get()).toThrow(expect.objectContaining({ code: 'FULCRO7024' }));
	});

	it('should end every shared borrow too', () => {
		const shieldGrid: Owned<number> = own(() => createManagedStorage(1, 0));
		const first: Borrowed<number> = borrow(shieldGrid);
		const second: Borrowed<number> = borrow(shieldGrid);

		shieldGrid[Symbol.dispose]();

		expect(() => first.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => second.get(0)).toThrow(ended('ReadOnlyView.get'));
	});

	it('should end the borrows when the scope is left by a throw', () => {
		let scan: Borrowed<number> | undefined;

		const fail = (): void => {
			using shieldGrid = own(() => createManagedStorage(1, 5));

			scan = borrow(shieldGrid);

			throw new RangeError('left early');
		};

		expect(fail).toThrow(RangeError);
		expect(() => scan?.get(0)).toThrow(ended('ReadOnlyView.get'));
	});

	it('should refuse everything asked of the owner afterwards', () => {
		const shieldGrid: Owned<number> = own(() => createManagedStorage(2, 0));

		shieldGrid[Symbol.dispose]();

		expect(() => borrow(shieldGrid)).toThrow(disposed('borrow'));
		expect(() => borrowMutable(shieldGrid)).toThrow(disposed('borrowMutable'));
		expect(() => move(shieldGrid)).toThrow(disposed('move'));
		expect(() => shieldGrid.length).toThrow(disposed('Owned.length'));
	});

	it('should do nothing when disposed twice', () => {
		const shieldGrid: Owned<number> = own(() => createManagedStorage(1, 0));

		shieldGrid[Symbol.dispose]();

		expect(() => {
			shieldGrid[Symbol.dispose]();
		}).not.toThrow();

		expect(() => borrow(shieldGrid)).toThrow(disposed('borrow'));
	});

	it('should leave the owner a move returned untouched, borrows included', () => {
		let second: Owned<number> | undefined;
		let scan: Borrowed<number> | undefined;

		{
			using first = own(() => createManagedStorage(2, 4));

			second = move(first);
			scan = borrow(second);
		}

		expect(scan.get(1)).toBe(4);
		expect(second.length).toBe(2);
		expect(borrow(second).get(0)).toBe(4);
	});

	it('should end the ownership a move handed to a using declaration', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 0));
		let scan: Borrowed<number> | undefined;
		let kept: Owned<number> | undefined;

		{
			using second = move(first);

			scan = borrow(second);
			kept = second;
		}

		expect(() => scan.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => borrow(kept)).toThrow(disposed('borrow'));
	});

	it('should end with the frame its memory came from, in one scope', () => {
		const stack = createStackAllocator(1024);
		let writing: MutableBorrow<Struct<typeof BlasterBolt>> | undefined;

		{
			using frame = stack.enter();
			using bolts = own(() => allocate(BlasterBolt, 4, frame));

			writing = borrowMutable(bolts);
			writing.set(0, BlasterBolt.from({ bearing: 1, range: 2 }));
		}

		// The borrow ended with its owner, and the frame gave back everything it
		// lent: the stack allocates from its front again.
		expect(() => writing.get(0)).toThrow(ended('View.get'));
		expect(stack.allocate(8, 8).bytes.byteOffset).toBe(0);
	});

	it('should be disposable by type', () => {
		expectTypeOf<Owned<number>>().toExtend<Disposable>();
	});
});
