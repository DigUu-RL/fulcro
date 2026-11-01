import { beforeAll, describe, expect, it } from 'vitest';

import { type CompiledEscape, compileEscape } from '@/src/tests/transformer/compileEscape';

/**
 * Transformer suite for the escape analysis.
 *
 * The fixture names every storage for the decision it must get: `local…` is
 * allocated from a frame, `kept…` stays where it was written. This suite holds
 * the rewritten fixture to those names, then runs the fixture compiled both
 * ways and compares what every function returns — the rewrite is only allowed
 * to change where bytes come from, never what the program computes.
 */

let compiled: CompiledEscape;

beforeAll(() => {
	compiled = compileEscape();
});

/**
 * The names of the fixture's storages that start with a prefix.
 *
 * @param prefix `local` or `kept`.
 * @returns The names, in the order the fixture declares them.
 */
const named = (prefix: 'local' | 'kept'): string[] => {
	return [
		...compiled.source.text.matchAll(new RegExp(`(?:const|let) (${prefix}\\w+) = allocate`, 'g')),
	].map((match) => match[1] ?? '');
};

/**
 * Calls every function of the fixture, reducing what each returns to values
 * that can be compared.
 *
 * @param exports What the fixture exports.
 * @returns What each function returned, by name.
 */
const results = async (exports: Record<string, unknown>): Promise<Record<string, unknown>> => {
	const fixture = exports as {
		sum: (length: number) => number;
		perRound: (rounds: number) => number;
		inABranch: (flag: boolean) => number;
		nested: () => number;
		inAMethod: { run: () => number };
		declared: () => number;
		fromAnImportedAllocator: () => number;
		shadowed: () => number;
		namedInAType: () => number;
		returned: () => { get: (index: number) => number; length: number };
		handedToAFunction: (read: (values: { length: number }) => number) => number;
		viewed: () => { get: (index: number) => number };
		captured: () => () => number;
		aliased: () => number;
		inAnObject: () => { keptShorthand: { get: (index: number) => number } };
		methodTakenOff: () => (index: number) => number;
		suspends: () => Promise<number>;
		generates: () => Iterable<number>;
		fromARenamedAllocator: () => number;
		fromAReassignableAllocator: () => number;
		fromAnAllocatorMadeInPlace: () => number;
		reassignableStorage: () => number;
	};

	return {
		sum: fixture.sum(100),
		perRound: fixture.perRound(10),
		inABranch: [fixture.inABranch(true), fixture.inABranch(false)],
		nested: fixture.nested(),
		inAMethod: fixture.inAMethod.run(),
		declared: fixture.declared(),
		fromAnImportedAllocator: fixture.fromAnImportedAllocator(),
		shadowed: fixture.shadowed(),
		namedInAType: fixture.namedInAType(),
		returned: fixture.returned().get(0),
		handedToAFunction: fixture.handedToAFunction((values) => values.length),
		viewed: fixture.viewed().get(0),
		captured: fixture.captured()(),
		aliased: fixture.aliased(),
		inAnObject: fixture.inAnObject().keptShorthand.get(0),
		methodTakenOff: fixture.methodTakenOff()(0),
		suspends: await fixture.suspends(),
		generates: [...fixture.generates()],
		fromARenamedAllocator: fixture.fromARenamedAllocator(),
		fromAReassignableAllocator: fixture.fromAReassignableAllocator(),
		fromAnAllocatorMadeInPlace: fixture.fromAnAllocatorMadeInPlace(),
		reassignableStorage: fixture.reassignableStorage(),
	};
};

describe('escape analysis at compile time', () => {
	it('should compile the fixture without type errors', () => {
		expect(compiled.errors).toEqual([]);
	});

	it('should cover both decisions', () => {
		expect(named('local').length).toBeGreaterThan(8);
		expect(named('kept').length).toBeGreaterThan(12);
	});

	it('should allocate every local… storage from a frame entered just before it', () => {
		for (const name of named('local')) {
			expect(compiled.rewritten, name).toMatch(
				new RegExp(
					`using (frame_\\d+) = (managed|shared)\\.enter\\(\\);\\s+const ${name} = allocate\\([^;]*, \\1\\);`,
				),
			);
		}
	});

	it('should leave every kept… storage allocated where it was written', () => {
		for (const name of named('kept')) {
			expect(compiled.rewritten, name).toMatch(
				new RegExp(`${name} = allocate\\(Integer, \\d+, \\w+(\\(\\))?\\);`),
			);

			expect(compiled.rewritten, name).not.toMatch(new RegExp(`${name} = allocate\\([^;]*frame`));
		}
	});

	it('should open exactly one frame per local storage, and none anywhere else', () => {
		expect(compiled.rewritten.match(/\.enter\(\)/g)).toHaveLength(named('local').length);
	});

	it('should compute what the written program computes', async () => {
		expect(await results(compiled.run(true))).toEqual(await results(compiled.run(false)));
	});

	it('should leave a kept storage live after its function returns', () => {
		const exports = compiled.run(true) as { returned: () => { get: (index: number) => number } };

		expect(() => exports.returned().get(0)).not.toThrow();
	});
});
