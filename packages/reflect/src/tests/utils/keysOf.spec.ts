import { describe, expect, it } from 'vitest';

import { keysOf } from '@/functions/utils/keysOf';

/**
 * Behaviour suite for `keysOf`.
 *
 * It is resolved entirely at compile time, so what is asserted here is what the
 * transformer emitted. It runs with the transformer applied, since the harness
 * wires it in.
 */

/** A shape with one of everything the walk has a rule for. */
interface Order {
	readonly id: number;
	note?: string;
	readonly customer: {
		readonly email: string;
		readonly city: { name: string };
	};
	readonly items: readonly { readonly sku: string; readonly qty: number }[];
	readonly status: 'pending' | 'paid';
	readonly placedAt: Date;
	readonly parent?: Order;
}

describe('keysOf', () => {
	it('should list the keys the type declares, in order', () => {
		expect(keysOf<Order>()).toEqual([
			'id',
			'note',
			'customer',
			'items',
			'status',
			'placedAt',
			'parent',
		]);
	});

	it('should include an optional key', () => {
		// It is declared, so it is a key. Whether a value carries it is a
		// different question, and one `keysOf` deliberately does not answer.
		expect(keysOf<Order>()).toContain('note');
	});

	it('should report an anonymous shape too', () => {
		expect(keysOf<{ a: number; b: string }>()).toEqual(['a', 'b']);
	});

	it('should refuse a call nothing resolved', () => {
		expect(() => (keysOf as () => readonly string[])()).toThrow(
			/was not resolved at compile time/,
		);
	});
});
