import { describe, expect, it } from 'vitest';

import { borrow } from '@/borrow';
import { createManagedStorage } from '@/managedStorage';
import { move } from '@/move';
import { own } from '@/own';
import type { Owned } from '@/owned';

import { coded } from './coded';

/**
 * Runtime refusals around `Owned<T>[Symbol.dispose]` that use an owner after
 * moving it, which the memory transformer refuses to compile, so this file
 * runs without it (`vitest.config.mts`, `memory-unchecked`).
 */

describe('Owned[Symbol.dispose], unchecked', () => {
	it('should do nothing to an owner already moved from', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 3));
		const second: Owned<number> = move(first);
		const reading = borrow(second);

		first[Symbol.dispose]();

		expect(reading.get(0)).toBe(3);
		expect(borrow(second).get(0)).toBe(3);
	});

	it('should still call a moved-from owner moved once its successor is disposed', () => {
		const first: Owned<number> = own(() => createManagedStorage(1, 0));
		const second: Owned<number> = move(first);

		second[Symbol.dispose]();

		expect(() => borrow(first)).toThrow(
			coded(
				new Error(
					'FULCRO7023: borrow: the owner was moved; use the owner move returned.',
				),
				{ operation: 'borrow' },
			),
		);
	});
});
