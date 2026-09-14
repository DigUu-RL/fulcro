import { describe, expect, it } from 'vitest';

import { defaultOf } from '@/functions/utils/defaultOf';

/** Shape exercising nesting, optionality and collections at once. */
interface Order {
	id: number;
	paid: boolean;
	label: string;
	customer: { name: string; active: boolean };
	items: string[];
	pair: [number, string];
	tags: Set<string>;
	note?: string;
	nickname: string | null;
}

/** Enum resolving to its first member. */
enum Status {
	Draft,
	Sent,
}

/** Self referencing shape, which has no finite default. */
interface TreeNode {
	label: string;
	parent: TreeNode;
}

/**
 * Runtime suite for `defaultOf`.
 *
 * These assertions only hold because the bundler plugin runs the transformer
 * over this file: the calls below are replaced by the values they describe
 * before anything executes. Reading them as ordinary function calls would be
 * misleading — `defaultOf` never runs.
 */
describe('defaultOf', () => {
	it('should resolve the primitives to their empty value', () => {
		expect(defaultOf<string>()).toBe('');
		expect(defaultOf<number>()).toBe(0);
		expect(defaultOf<boolean>()).toBe(false);
	});

	it('should resolve a literal union to its first inhabitant', () => {
		expect(defaultOf<'dark' | 'light'>()).toBe('dark');
	});

	it('should build a nested shape, filling what the type requires', () => {
		const order: Order = defaultOf<Order>();

		expect(order.id).toBe(0);
		expect(order.paid).toBe(false);
		expect(order.label).toBe('');
		expect(order.customer).toEqual({ name: '', active: false });
	});

	it('should leave optional properties out, since absence satisfies them', () => {
		expect('note' in defaultOf<Order>()).toBe(false);
	});

	it('should fill a tuple position by position and empty an array', () => {
		const order: Order = defaultOf<Order>();

		expect(order.items).toEqual([]);
		expect(order.pair).toEqual([0, '']);
	});

	it('should instantiate the built-in collections rather than describe them', () => {
		const order: Order = defaultOf<Order>();

		expect(order.tags).toBeInstanceOf(Set);
		expect(order.tags.size).toBe(0);
	});

	it('should prefer the empty inhabitant of a nullable union', () => {
		expect(defaultOf<Order>().nickname).toBeNull();
		expect(defaultOf<string | undefined>()).toBeUndefined();
	});

	it('should resolve an enum to its first member', () => {
		expect(defaultOf<Status>()).toBe(Status.Draft);
	});

	it('should close a circular type instead of nesting forever', () => {
		const node: TreeNode = defaultOf<TreeNode>();

		expect(node.label).toBe('');
		expect(node.parent).toBeNull();
	});

	it('should honour a function type with its own return default', () => {
		const callback = defaultOf<(value: number) => string>();

		expect(callback(1)).toBe('');
	});

	it('should infer the type from the context when none is written', () => {
		const customer: Order['customer'] = defaultOf();

		expect(customer).toEqual({ name: '', active: false });
	});

	it('should refuse to answer when the call cannot be resolved statically', () => {
		// The transformer only rewrites direct calls it can trace back to the
		// module. Reached through a binding it cannot follow, the runtime
		// implementation takes over — and throws rather than inventing a value.
		const indirect: <T>() => T = defaultOf;

		expect(() => indirect<string>()).toThrow(/only exists at compile time/);
	});
});
