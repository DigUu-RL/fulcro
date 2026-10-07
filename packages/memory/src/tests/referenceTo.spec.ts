import { describe, expect, expectTypeOf, it } from 'vitest';

import type { MemoryReference } from '@/memoryReference';
import { referenceTo } from '@/referenceTo';

/**
 * Behaviour suite for `referenceTo`, and for the `MemoryReference<T>` it
 * returns.
 *
 * A reference is one value that can be read and replaced, held as it is.
 */

describe('referenceTo', () => {
	it('should read the value it started with', () => {
		expect(referenceTo(3).get()).toBe(3);
	});

	it('should read back what was set', () => {
		const counter: MemoryReference<number> = referenceTo(0);

		counter.set(counter.get() + 1);
		counter.set(counter.get() + 1);

		expect(counter.get()).toBe(2);
	});

	it('should hold the very value it was given, not a copy', () => {
		const settings = { verbose: true };
		const reference: MemoryReference<{ verbose: boolean }> =
			referenceTo(settings);

		expect(reference.get()).toBe(settings);
	});

	it('should keep NaN, -0 and undefined exactly', () => {
		const reference: MemoryReference<number | undefined> = referenceTo<
			number | undefined
		>(Number.NaN);

		expect(reference.get()).toBeNaN();

		reference.set(-0);

		expect(Object.is(reference.get(), -0)).toBe(true);

		reference.set(undefined);

		expect(reference.get()).toBeUndefined();
	});

	it('should keep two references apart', () => {
		const first: MemoryReference<string> = referenceTo('a');
		const second: MemoryReference<string> = referenceTo('a');

		first.set('b');

		expect(second.get()).toBe('a');
	});

	it('should be frozen, its methods working taken off it', () => {
		const reference: MemoryReference<number> = referenceTo(1);
		const { get, set } = reference;

		set(9);

		expect(Object.isFrozen(reference)).toBe(true);
		expect(Object.keys(reference).sort()).toEqual(['get', 'set']);
		expect(get()).toBe(9);
	});

	it('should infer its type from the value given', () => {
		expectTypeOf(referenceTo(0)).toEqualTypeOf<MemoryReference<number>>();
		expectTypeOf(referenceTo('a')).toEqualTypeOf<MemoryReference<string>>();
		expectTypeOf(referenceTo<string | null>(null)).toEqualTypeOf<
			MemoryReference<string | null>
		>();
	});
});
