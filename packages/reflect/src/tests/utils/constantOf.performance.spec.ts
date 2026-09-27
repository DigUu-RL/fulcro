import * as path from 'node:path';
import * as vm from 'node:vm';

import * as ts from 'typescript';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { constantOf } from '@/functions/utils/constantOf';
import transformer from '@/transformer';

/**
 * Performance suite for `constantOf`.
 *
 * Two promises, each counted. At runtime the function runs exactly once per
 * call and the value is walked once. At compile time each constant is
 * evaluated once per program — a constant read by many others contributes its
 * value, it is not run again for each of them — which is counted in scripts
 * handed to `node:vm`.
 */

vi.mock('node:vm', async (importOriginal) => {
	const original = await importOriginal<typeof import('node:vm')>();

	return { ...original, runInContext: vi.fn(original.runInContext) };
});

/** The runtime, through a name the transformer applied to this suite ignores. */
const evaluateAtRuntime: typeof constantOf = constantOf;

/** Elements of the large values measured. */
const VOLUME = 10_000;

/** Scripts `node:vm` ran while the fixture of provable calls compiled. */
let scriptsEvaluated = 0;

// Building the program is what costs, and a hook has the generous ceiling the
// transformer suites are given; a test body does not.
beforeAll(() => {
	const fixture: string = path.resolve(
		__dirname,
		'../transformer/constantOf.sample.ts',
	);
	const program: ts.Program = ts.createProgram([fixture], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		strict: true,
		skipLibCheck: true,
	});
	const transform = transformer(
		program,
		{},
		{ addDiagnostic: () => undefined },
	);

	vi.mocked(vm.runInContext).mockClear();
	program.emit(
		program.getSourceFile(fixture),
		() => undefined,
		undefined,
		false,
		{
			before: [transform],
		},
	);

	// Each evaluation hands the context two scripts: the one removing
	// `Math.random`, and its own.
	scriptsEvaluated = vi
		.mocked(vm.runInContext)
		.mock.calls.filter(([script]) => script !== 'delete Math.random;').length;
});

afterEach(() => {
	vi.clearAllMocks();
});

describe('constantOf', () => {
	it('should run the function exactly once per call', () => {
		const compute = vi.fn(() => [1, 2, 3]);

		evaluateAtRuntime(compute);
		evaluateAtRuntime(compute);

		expect(compute).toHaveBeenCalledTimes(2);
	});

	it('should read a value in proportion to its size to check and freeze it', () => {
		/**
		 * Checks and freezes a list of objects, counting reads of their fields.
		 *
		 * @param length Objects in the list.
		 * @returns Reads of a field's descriptor.
		 */
		const readsFor = (length: number): number => {
			let reads = 0;
			const observed = Array.from(
				{ length },
				(_item, index) =>
					new Proxy(
						{ index },
						{
							getOwnPropertyDescriptor: (target, key) => {
								reads++;

								return Reflect.getOwnPropertyDescriptor(target, key);
							},
						},
					),
			);

			evaluateAtRuntime(() => observed as never);

			return reads;
		};

		// The check, `Object.freeze` and the walk down each read a field a fixed
		// number of times the language defines; what is asserted is that the
		// count per element does not grow with the size of the value.
		const single: number = readsFor(VOLUME);

		expect(readsFor(2 * VOLUME)).toBe(2 * single);
		expect(single).toBeLessThanOrEqual(3 * VOLUME);
	});

	it('should evaluate a constant read by many others once per program', () => {
		// Eleven calls in the fixture, `squares` and `imported` read again by
		// `chained`: still eleven evaluations, not thirteen.
		expect(scriptsEvaluated).toBe(11);
	});
});
