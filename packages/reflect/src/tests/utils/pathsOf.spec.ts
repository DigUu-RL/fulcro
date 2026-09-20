import { describe, expect, it } from 'vitest';

import { pathsOf } from '@/functions/utils/pathsOf';

/**
 * Behaviour suite for `pathsOf`.
 *
 * It is resolved entirely at compile time, so what is asserted here is what the
 * transformer emitted. It runs with the transformer applied, since the harness
 * wires it in.
 *
 * This one gets the most attention of the describing utilities, because it is
 * the one with rules that only make sense once you have seen the version
 * without them: descending into a `string` yields the whole of
 * `String.prototype`, and `customer.email.trimLeft` is a real property path and
 * useless as a data path.
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

describe('pathsOf', () => {
	/**
	 * Reads back one entry by its path.
	 *
	 * @param path Path being looked up.
	 * @returns The entry, when there is one.
	 */
	const at = (path: string) =>
		pathsOf<Order>().find((entry) => entry.path === path);

	it('should walk to a nested leaf', () => {
		expect(at('customer.email')?.type).toBe('string');
		expect(at('customer.city.name')?.type).toBe('string');
	});

	it('should stop at a primitive', () => {
		// The rule the whole walk rests on. Without it the answer includes
		// `customer.email.trimLeft`, which is a real property path and nonsense
		// as a data path.
		const paths = pathsOf<Order>().map((entry) => entry.path);

		expect(paths.some((path) => path.includes('trimLeft'))).toBe(false);
		expect(paths.some((path) => path.includes('toFixed'))).toBe(false);
	});

	it('should mark the elements of an array', () => {
		expect(at('items[].sku')?.type).toBe('string');
		expect(at('items[].qty')?.type).toBe('number');
	});

	it('should report a known class rather than its methods', () => {
		expect(at('placedAt')?.type).toBe('Date');
		expect(
			pathsOf<Order>().some((entry) => entry.path.startsWith('placedAt.')),
		).toBe(false);
	});

	it('should report a union of literals as one leaf', () => {
		expect(at('status')?.type).toBe('"pending" | "paid"');
	});

	it('should stop where a type contains itself', () => {
		// Infinitely many paths otherwise. The honest answer is where the repeat
		// begins, with the type named at the end of it.
		expect(at('parent')?.type).toBe('Order');
		expect(
			pathsOf<Order>().some((entry) => entry.path.startsWith('parent.')),
		).toBe(false);
	});

	it('should carry optionality down the path', () => {
		expect(at('note')?.optional).toBe(true);
		expect(at('id')?.optional).toBe(false);
		expect(at('customer.email')?.optional).toBe(false);
	});

	it('should mark a leaf below an optional step as optional', () => {
		interface Wrapper {
			readonly inner?: { readonly deep: string };
		}

		const found = pathsOf<Wrapper>().find(
			(entry) => entry.path === 'inner.deep',
		);

		expect(found?.optional).toBe(true);
	});

	it('should refuse a call nothing resolved', () => {
		expect(() => (pathsOf as () => readonly unknown[])()).toThrow(
			/was not resolved at compile time/,
		);
	});
});
