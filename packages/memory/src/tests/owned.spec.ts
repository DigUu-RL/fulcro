import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/allocate';
import { borrow } from '@/borrow';
import type { Borrowed } from '@/borrowed';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { move } from '@/move';
import type { MutableBorrow } from '@/mutableBorrow';
import { own } from '@/own';
import type { Owned } from '@/owned';
import { pointerTo } from '@/pointerTo';
import { createStackAllocator } from '@/stackAllocator';

import { coded } from './coded';

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
const disposed = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7030: ${operation}: the owner was disposed when its scope ended; nothing can be borrowed or moved from it any more.`,
		),
		{ operation },
	);

/** The error an ended borrow throws, for an operation. */
const ended = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7024: ${operation}: the borrow has ended — its owner was moved or disposed, or borrowed again in a way it cannot share; borrow again.`,
		),
		{ operation },
	);

const Particle = struct('Particle', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});

describe('Owned[Symbol.dispose]', () => {
	it('should end every borrow when the using scope ends', () => {
		let writing: MutableBorrow<number> | undefined;

		{
			using scores = own(() => createManagedStorage(3, 0));

			writing = borrowMutable(scores);
			writing.set(0, 7);

			expect(writing.get(0)).toBe(7);
		}

		expect(() => writing?.get(0)).toThrow(ended('View.get'));
		expect(() => writing?.set(0, 1)).toThrow(ended('View.set'));
	});

	it('should end what was cut from a borrow as well', () => {
		const scores: Owned<number> = own(() => createManagedStorage(4, 1));
		const writing: MutableBorrow<number> = borrowMutable(scores);
		const subview = writing.subview(1, 2);
		const readOnly = writing.readOnly();
		const pointer = pointerTo(writing, 2);

		scores[Symbol.dispose]();

		expect(() => subview.get(0)).toThrow(ended('View.get'));
		expect(() => readOnly.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => pointer.get()).toThrow(
			expect.objectContaining({ code: 'FULCRO7024' }),
		);
	});

	it('should end every shared borrow too', () => {
		const scores: Owned<number> = own(() => createManagedStorage(1, 0));
		const first: Borrowed<number> = borrow(scores);
		const second: Borrowed<number> = borrow(scores);

		scores[Symbol.dispose]();

		expect(() => first.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => second.get(0)).toThrow(ended('ReadOnlyView.get'));
	});

	it('should end the borrows when the scope is left by a throw', () => {
		let reading: Borrowed<number> | undefined;

		const fail = (): void => {
			using scores = own(() => createManagedStorage(1, 5));

			reading = borrow(scores);

			throw new RangeError('left early');
		};

		expect(fail).toThrow(RangeError);
		expect(() => reading?.get(0)).toThrow(ended('ReadOnlyView.get'));
	});

	it('should refuse everything asked of the owner afterwards', () => {
		const scores: Owned<number> = own(() => createManagedStorage(2, 0));

		scores[Symbol.dispose]();

		expect(() => borrow(scores)).toThrow(disposed('borrow'));
		expect(() => borrowMutable(scores)).toThrow(disposed('borrowMutable'));
		expect(() => move(scores)).toThrow(disposed('move'));
		expect(() => scores.length).toThrow(disposed('Owned.length'));
	});

	it('should do nothing when disposed twice', () => {
		const scores: Owned<number> = own(() => createManagedStorage(1, 0));

		scores[Symbol.dispose]();

		expect(() => scores[Symbol.dispose]()).not.toThrow();
		expect(() => borrow(scores)).toThrow(disposed('borrow'));
	});

	it('should leave the owner a move returned untouched, borrows included', () => {
		let second: Owned<number> | undefined;
		let reading: Borrowed<number> | undefined;

		{
			using first = own(() => createManagedStorage(2, 4));

			second = move(first);
			reading = borrow(second);
		}

		expect(reading.get(1)).toBe(4);
		expect(second.length).toBe(2);
		expect(borrow(second).get(0)).toBe(4);
	});

	it('should end the ownership a move handed to a using declaration', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 0));
		let reading: Borrowed<number> | undefined;
		let kept: Owned<number> | undefined;

		{
			using second = move(first);

			reading = borrow(second);
			kept = second;
		}

		expect(() => reading?.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => borrow(kept as Owned<number>)).toThrow(disposed('borrow'));
	});

	it('should end with the frame its memory came from, in one scope', () => {
		const stack = createStackAllocator(1024);
		let writing: MutableBorrow<Struct<typeof Particle>> | undefined;

		{
			using frame = stack.enter();
			using particles = own(() => allocate(Particle, 4, frame));

			writing = borrowMutable(particles);
			writing.set(0, Particle.from({ x: 1, y: 2 }));
		}

		// The borrow ended with its owner, and the frame gave back everything it
		// lent: the stack allocates from its front again.
		expect(() => writing?.get(0)).toThrow(ended('View.get'));
		expect(stack.allocate(8, 8).bytes.byteOffset).toBe(0);
	});

	it('should be disposable by type', () => {
		expectTypeOf<Owned<number>>().toExtend<Disposable>();
	});
});
