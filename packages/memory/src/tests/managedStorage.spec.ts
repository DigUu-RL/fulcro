import { describe, expect, expectTypeOf, it } from 'vitest';

import { createManagedStorage } from '@/managedStorage';
import type { Storage } from '@/storage';

/**
 * Behaviour suite for `createManagedStorage`.
 *
 * What the contract suite cannot say: values of any type are held as they
 * are, by reference, and never copied.
 */

interface User {
	readonly id: number;
	readonly name: string;
}

describe('createManagedStorage', () => {
	it('should hold the initial value at every position', () => {
		const flags: Storage<boolean> = createManagedStorage(3, true);

		expect([flags.get(0), flags.get(1), flags.get(2)]).toEqual([
			true,
			true,
			true,
		]);
	});

	it('should return the very value it was given, not a copy', () => {
		const ada: User = { id: 1, name: 'Ada' };
		const users: Storage<User | null> = createManagedStorage<User | null>(
			2,
			null,
		);

		users.set(0, ada);

		expect(users.get(0)).toBe(ada);
	});

	it('should share the initial value between positions, as it was given', () => {
		const shared: string[] = [];
		const lists: Storage<string[]> = createManagedStorage(2, shared);

		expect(lists.get(0)).toBe(shared);
		expect(lists.get(1)).toBe(shared);
	});

	it('should hold values a fixed layout could not', () => {
		const handlers: Storage<(() => number) | undefined> = createManagedStorage<
			(() => number) | undefined
		>(2, undefined);
		const handler = (): number => 42;

		handlers.set(1, handler);

		expect(handlers.get(0)).toBeUndefined();
		expect(handlers.get(1)?.()).toBe(42);
	});

	it('should keep NaN and -0 exactly', () => {
		const numbers: Storage<number> = createManagedStorage(2, 0);

		numbers.set(0, Number.NaN);
		numbers.set(1, -0);

		expect(numbers.get(0)).toBeNaN();
		expect(Object.is(numbers.get(1), -0)).toBe(true);
	});

	it('should infer its type from the initial value', () => {
		expectTypeOf(createManagedStorage(1, 0)).toEqualTypeOf<Storage<number>>();
		expectTypeOf(createManagedStorage(1, 'a')).toEqualTypeOf<Storage<string>>();
		expectTypeOf(createManagedStorage<User | null>(1, null)).toEqualTypeOf<
			Storage<User | null>
		>();
	});
});
