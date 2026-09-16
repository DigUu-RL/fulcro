import { describe, expect, it } from 'vitest';

import { keysOf } from '@/functions/utils/keysOf';
import { pathsOf } from '@/functions/utils/pathsOf';
import { typeOf } from '@/functions/utils/typeOf';

/**
 * Behaviour suite for the three utilities that describe a type rather than a
 * value: `keysOf`, `typeOf<T>()` and `pathsOf`.
 *
 * All three are resolved entirely at compile time, so what is asserted here is
 * what the transformer emitted. They run with it applied, since the harness
 * wires it in.
 *
 * `pathsOf` gets the most attention, because it is the one with rules that only
 * make sense once you have seen the version without them: descending into a
 * `string` yields the whole of `String.prototype`, and `customer.email.trimLeft`
 * is a real property path and useless as a data path.
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

describe('typeOf<T>()', () => {
	it('should name the type and how it was declared', () => {
		const described = typeOf<Order>();

		expect(described.name).toBe('Order');
		expect(described.kind).toBe('interface');
		expect(described.text).toBe('Order');
	});

	it('should point at where the type was declared', () => {
		const site = typeOf<Order>().site;

		expect(site).not.toBeNull();
		expect(site?.path).toContain('describing.spec.ts');
		expect(site?.line).toBeGreaterThan(0);
	});

	it('should list the members with their types', () => {
		const members = typeOf<Order>().members;

		expect(members.map((member) => member.name)).toEqual([
			'id',
			'note',
			'customer',
			'items',
			'status',
			'placedAt',
			'parent',
		]);

		expect(members.find((member) => member.name === 'id')?.type).toBe('number');
	});

	it('should say which members are optional and which are readonly', () => {
		// The two things a value can never report about itself: an object cannot
		// tell you a property it happens to carry was declared optional.
		const members = typeOf<Order>().members;

		const byName = (name: string) =>
			members.find((member) => member.name === name);

		expect(byName('note')?.optional).toBe(true);
		expect(byName('id')?.optional).toBe(false);
		expect(byName('id')?.readonly).toBe(true);
		expect(byName('note')?.readonly).toBe(false);
	});

	it('should report the branches of a union', () => {
		const described = typeOf<'pending' | 'paid'>();

		expect(described.union).toEqual(['"pending"', '"paid"']);
		expect(described.members).toEqual([]);
	});

	it('should report the element of an array', () => {
		expect(typeOf<string[]>().element).toBe('string');
	});

	it('should leave union and element null for an ordinary shape', () => {
		const described = typeOf<Order>();

		expect(described.union).toBeNull();
		expect(described.element).toBeNull();
	});

	it('should still describe a value when given one', () => {
		// The two forms answer different questions and both have to keep working.
		expect(typeOf(42).typeId).toBe('integer');
		expect(typeOf(undefined).typeId).toBe('undefined');
	});

	it('should refuse the generic form when nothing resolved it', () => {
		expect(() => (typeOf as () => unknown)()).toThrow(
			/was not resolved at compile time/,
		);
	});
});

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
