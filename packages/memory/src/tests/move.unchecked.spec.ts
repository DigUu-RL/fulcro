import { describe, expect, it } from 'vitest';

import { asReadOnlyView } from '@/asReadOnlyView';
import { borrow } from '@/borrow';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { move } from '@/move';
import { own } from '@/own';
import type { Owned } from '@/owned';
import { pointerTo } from '@/pointerTo';

import { coded } from './coded';

/**
 * Runtime refusals of `move`: the owner it spent, and every borrow of it.
 *
 * Unchecked: these use an owner after moving it, which the memory transformer
 * refuses to compile, so this file runs without it — as a consumer's code does
 * before the transformer is wired up (`vitest.config.mts`, `memory-unchecked`).
 */

/** The error a spent owner throws, for an operation. */
const spent = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7023: ${operation}: the owner was moved; use the owner move returned.`,
		),
		{ operation },
	);

/** The error an ended borrow throws, for an operation. */
const ended = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7024: ${operation}: the borrow has ended — its owner was moved, or borrowed again in a way it cannot share; borrow again.`,
		),
		{ operation },
	);

describe('move, unchecked', () => {
	it('should refuse everything asked of the owner it spent', () => {
		const first: Owned<number> = own(() => createManagedStorage(2, 0));
		const second: Owned<number> = move(first);

		expect(Object.is(second, first)).toBe(false);
		expect(() => borrow(first)).toThrow(spent('borrow'));
		expect(() => borrowMutable(first)).toThrow(spent('borrowMutable'));
		expect(() => move(first)).toThrow(spent('move'));
		expect(() => first.length).toThrow(spent('Owned.length'));
		expect(borrow(second).get(1)).toBe(0);
	});

	it('should refuse every owner but the last of a chain', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 0));
		const second: Owned<number> = move(first);
		const third: Owned<number> = move(second);

		expect(() => borrow(second)).toThrow(spent('borrow'));
		expect(third.length).toBe(1);
	});

	it('should end every borrow of the owner it spent, and what was made from them', () => {
		const first: Owned<number> = own(() => createManagedStorage(4, 0));
		const reading = borrow(first);
		const subview = reading.subview(1);
		const viewed = asReadOnlyView(reading, 3);

		move(first);

		expect(() => reading.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => subview.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => viewed.get(0)).toThrow(
			expect.objectContaining({ code: 'FULCRO7024' }),
		);
	});

	it('should end a borrow for writing, its read-only view and a pointer into it', () => {
		const first: Owned<number> = own(() => createManagedStorage(2, 0));
		const writing = borrowMutable(first);
		const reading = writing.readOnly();
		const pointer = pointerTo(writing, 1);

		move(first);

		expect(() => writing.set(0, 1)).toThrow(ended('View.set'));
		expect(() => reading.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => pointer.set(1)).toThrow(
			expect.objectContaining({ code: 'FULCRO7024' }),
		);
	});
});
