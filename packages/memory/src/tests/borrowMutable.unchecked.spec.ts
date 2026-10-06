import { describe, expect, it } from 'vitest';

import { asView } from '@/asView';
import { borrow } from '@/borrow';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { coded } from './coded';

/**
 * Runtime refusals of an exclusive borrow: it ends as soon as its owner is
 * lent again, for reading or for writing, and every access through it — or
 * through anything made from it — is refused from then on.
 *
 * Unchecked: these use a borrow after it ended, which the memory transformer
 * refuses to compile, so this file runs without it (`vitest.config.mts`,
 * `memory-unchecked`).
 */

/** The error an ended borrow throws, for an operation. */
const ended = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7024: ${operation}: the borrow has ended — its owner was moved, or borrowed again in a way it cannot share; borrow again.`,
		),
		{ operation },
	);

describe('borrowMutable, unchecked', () => {
	it('should end the exclusive borrow before it', () => {
		const owner: Owned<number> = own(() => createManagedStorage(2, 0));
		const first = borrowMutable(owner);
		const second = borrowMutable(owner);

		expect(() => first.set(0, 1)).toThrow(ended('View.set'));
		expect(() => first.get(0)).toThrow(ended('View.get'));

		second.set(0, 2);

		expect(second.get(0)).toBe(2);
	});

	it('should end when the owner is lent for reading', () => {
		const owner: Owned<number> = own(() => createManagedStorage(2, 0));
		const writing = borrowMutable(owner);

		borrow(owner);

		expect(() => writing.set(1, 1)).toThrow(ended('View.set'));
	});

	it('should end what was made from it as well', () => {
		const owner: Owned<number> = own(() => createManagedStorage(4, 0));
		const writing = borrowMutable(owner);
		const subview = writing.subview(1);
		const readOnly = writing.readOnly();
		const viewed = asView(writing, 2);

		borrowMutable(owner);

		expect(() => subview.set(0, 1)).toThrow(ended('View.set'));
		expect(() => readOnly.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => viewed.set(0, 1)).toThrow(
			expect.objectContaining({ code: 'FULCRO7024' }),
		);
	});

	it('should leave the values written before it ended in place', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));
		const writing = borrowMutable(owner);

		writing.set(0, 9);
		borrow(owner);

		expect(() => writing.set(0, 1)).toThrow(ended('View.set'));
		expect(borrow(owner).get(0)).toBe(9);
	});
});
