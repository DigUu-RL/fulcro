import { describe, expect, it } from 'vitest';

import { type PathAccessor, pathOf } from '@/src/functions/utils/pathOf';

/**
 * Behaviour suite for `pathOf`.
 *
 * It has two implementations that must agree: the transformer resolves a call
 * to a literal, and the runtime parses the source of the closure for builds
 * without it. Both are exercised here, and the trick that reaches the second is
 * worth knowing — a call through a local alias is not one the transformer can
 * claim, since it follows the symbol back to the declaring module and an alias
 * declares nothing.
 */

/** A shape deep enough for a path to be worth asking about. */
interface DockingRecord {
	readonly id: number;
	readonly captain: { readonly address: { readonly system: string } };
	// Never empty, so `items[0]` is an item: the accessors below are parsed from
	// their source text, which an optional chain or a cast would change.
	readonly items: readonly [{ readonly manifest: string }, ...{ readonly manifest: string }[]];
}

declare const order: DockingRecord;

/**
 * The same function, reached through a name the transformer does not own.
 *
 * Calls through this are left alone, so they land on the runtime parser.
 */
const runtime: (accessor: PathAccessor) => string | null = pathOf;

describe('resolved at compile time', () => {
	it('should report every segment, where nameOf reports one', () => {
		expect(pathOf(() => order.captain.address.system)).toBe('captain.address.system');
	});

	it('should drop the root', () => {
		// The path is relative to the object being described — a form, a row, a
		// document — so repeating whatever the local variable happened to be
		// called would make the answer depend on that.
		expect(pathOf(() => order.id)).toBe('id');
	});

	it('should keep an array index in brackets', () => {
		expect(pathOf(() => order.items[0].manifest)).toBe('items[0].manifest');
	});

	it('should read a quoted key as an ordinary segment', () => {
		expect(pathOf(() => order.captain.address.system)).toBe('captain.address.system');
	});

	it('should never evaluate the accessor', () => {
		let reads = 0;

		const watched = {
			get value(): number {
				reads++;
				return 1;
			},
		};

		pathOf(() => watched.value);

		expect(reads).toBe(0);
	});
});

describe('parsed at runtime, without the transformer', () => {
	it.each([
		['a nested path', (): string => order.captain.address.system, 'captain.address.system'],
		['a single segment', (): number => order.id, 'id'],
		['an indexed element', (): string => order.items[0].manifest, 'items[0].manifest'],
		['a quoted key', (): string => order.captain.address.system, 'captain.address.system'],
	])('should agree with the compiled form on %s', (_label, accessor, expected) => {
		// The two implementations answering differently would be worse than
		// either being wrong, since which one runs depends on the build.
		expect(runtime(accessor)).toBe(expected);
	});

	it('should refuse something that is not a path', () => {
		expect(runtime(() => 42)).toBeNull();
		expect(runtime(() => order)).toBeNull();
	});

	it('should refuse a call, which reads nothing', () => {
		expect(runtime(() => order.items.map((item) => item.manifest))).toBeNull();
	});
});
