import { describe, expect, it } from 'vitest';

import { asReadOnlyView } from '@/asReadOnlyView';
import { borrow } from '@/borrow';
import { borrowMutable } from '@/borrowMutable';
import { createManagedStorage } from '@/managedStorage';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { coded } from './coded';

/**
 * Runtime refusals of a shared borrow: it ends when its owner is lent for
 * writing, and reading through it — or through anything made from it — is
 * refused from then on.
 *
 * Unchecked: these read a borrow after it ended, which the memory transformer
 * refuses to compile, so this file runs without it (`vitest.config.mts`,
 * `memory-unchecked`).
 */

/** The error an ended borrow throws, for an operation. */
const ended = (operation: string): Error =>
	coded(
		new Error(
			`FULCRO7024: ${operation}: the borrow has ended — its owner was moved or disposed, or borrowed again in a way it cannot share; borrow again.`,
		),
		{ operation },
	);

describe('borrow, unchecked', () => {
	it('should end every shared borrow once the owner is lent for writing', () => {
		const owner: Owned<number> = own(() => createManagedStorage(3, 0));
		const first = borrow(owner);
		const second = borrow(owner);

		borrowMutable(owner);

		expect(() => first.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => second.get(0)).toThrow(ended('ReadOnlyView.get'));
	});

	it('should end what was made from it as well', () => {
		const owner: Owned<number> = own(() => createManagedStorage(3, 0));
		const reading = borrow(owner);
		const subview = reading.subview(1).subview(1);
		const viewed = asReadOnlyView(reading, 1);

		borrowMutable(owner);

		expect(() => subview.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(() => viewed.get(0)).toThrow(
			expect.objectContaining({ code: 'FULCRO7024' }),
		);
	});

	it('should end an exclusive borrow taken before it, and not the other way round', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));
		const writing = borrowMutable(owner);
		const reading = borrow(owner);

		expect(() => writing.get(0)).toThrow(ended('View.get'));
		expect(reading.get(0)).toBe(0);
	});

	it('should read again through a borrow taken after the conflict', () => {
		const owner: Owned<number> = own(() => createManagedStorage(1, 0));
		const stale = borrow(owner);

		borrowMutable(owner).set(0, 4);

		expect(() => stale.get(0)).toThrow(ended('ReadOnlyView.get'));
		expect(borrow(owner).get(0)).toBe(4);
	});
});
