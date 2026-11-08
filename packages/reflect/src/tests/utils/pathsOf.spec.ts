import { describe, expect, expectTypeOf, it } from 'vitest';

import { pathsOf, type TypePath } from '@/src/functions/utils/pathsOf';

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
 * `String.prototype`, and `captain.callSign.trimLeft` is a real property path and
 * useless as a data path.
 */

/** A shape with one of everything the walk has a rule for. */
interface DockingRecord {
	readonly id: number;
	note?: string;
	readonly captain: {
		readonly callSign: string;
		readonly system: { name: string };
	};
	readonly cargo: readonly { readonly manifest: string; readonly qty: number }[];
	readonly status: 'docked' | 'departed';
	readonly arrivedAt: Date;
	readonly parent?: DockingRecord;
}

describe('pathsOf', () => {
	/**
	 * Reads back one entry by its path.
	 *
	 * @param path Path being looked up.
	 * @returns The entry, when there is one.
	 */
	const entryAt = (path: string): ReturnType<typeof pathsOf<DockingRecord>>[number] | undefined => {
		return pathsOf<DockingRecord>().find((entry) => entry.path === path);
	};

	it('should walk to a nested leaf', () => {
		expect(entryAt('captain.callSign')?.type).toBe('string');
		expect(entryAt('captain.system.name')?.type).toBe('string');
	});

	it('should stop at a primitive', () => {
		// The rule the whole walk rests on. Without it the answer includes
		// `captain.callSign.trimLeft`, which is a real property path and nonsense
		// as a data path.
		const paths = pathsOf<DockingRecord>().map((entry) => entry.path);

		expect(paths.some((path) => path.includes('trimLeft'))).toBe(false);
		expect(paths.some((path) => path.includes('toFixed'))).toBe(false);
	});

	it('should mark the elements of an array', () => {
		expect(entryAt('cargo[].manifest')?.type).toBe('string');
		expect(entryAt('cargo[].qty')?.type).toBe('number');
	});

	it('should report a known class rather than its methods', () => {
		expect(entryAt('arrivedAt')?.type).toBe('Date');

		expect(pathsOf<DockingRecord>().some((entry) => entry.path.startsWith('arrivedAt.'))).toBe(
			false,
		);
	});

	it('should report a union of literals as one leaf', () => {
		expect(entryAt('status')?.type).toBe('"docked" | "departed"');
	});

	it('should stop where a type contains itself', () => {
		// Infinitely many paths otherwise. The honest answer is where the repeat
		// begins, with the type named at the end of it.
		expect(entryAt('parent')?.type).toBe('DockingRecord');
		expect(pathsOf<DockingRecord>().some((entry) => entry.path.startsWith('parent.'))).toBe(false);
	});

	it('should carry optionality down the path', () => {
		expect(entryAt('note')?.optional).toBe(true);
		expect(entryAt('id')?.optional).toBe(false);
		expect(entryAt('captain.callSign')?.optional).toBe(false);
	});

	it('should mark a leaf below an optional step as optional', () => {
		interface Wrapper {
			readonly inner?: { readonly deep: string };
		}

		const found = pathsOf<Wrapper>().find((entry) => entry.path === 'inner.deep');

		expect(found?.optional).toBe(true);
	});

	it('should refuse a call nothing resolved', () => {
		expect(() => (pathsOf as () => readonly unknown[])()).toThrow(
			/was not resolved at compile time/,
		);
	});
});

describe('what pathsOf declares', () => {
	it('should return paths of the type it was asked about', () => {
		expectTypeOf<ReturnType<typeof pathsOf<DockingRecord>>>().toEqualTypeOf<
			readonly TypePath<DockingRecord>[]
		>();

		expectTypeOf<TypePath<DockingRecord>>().toExtend<TypePath>();
		expectTypeOf<TypePath<DockingRecord>>().not.toExtend<TypePath<number>>();
	});
});
