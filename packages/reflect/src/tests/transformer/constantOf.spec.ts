import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { constantOf } from '@/functions/utils/constantOf';
import transformer from '@/transformer';

/**
 * Transformer suite for `constantOf`.
 *
 * Compiles fixtures with the transformer applied and reads two things back:
 * the literal each provable call was replaced by — evaluated, so the assertions
 * hold whatever the printer does with whitespace, and compared with what the
 * runtime computes for the same function — and the diagnostics of the calls
 * that could not be proved, each at its own line.
 */

/** Root of the package, which the reported declaration paths are relative to. */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** Options every fixture compiles with. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Node10,
	strict: true,
	noEmitOnError: false,
	skipLibCheck: true,
};

/** What compiling one fixture produced. */
interface Compiled {
	readonly emitted: string;
	readonly refused: readonly ts.Diagnostic[];
}

/**
 * Compiles a fixture with the transformer applied, collecting what it refused
 * the way `ts-patch` would, through `addDiagnostic`.
 *
 * @param fileName Fixture beside this suite.
 * @returns Its emitted JavaScript, and the diagnostics the transformer added.
 */
const compile = (fileName: string): Compiled => {
	const fixture: string = path.resolve(__dirname, fileName);
	const program: ts.Program = ts.createProgram([fixture], COMPILER_OPTIONS);
	const refused: ts.Diagnostic[] = [];
	const transform = transformer(
		program,
		{ projectRoot: PROJECT_ROOT },
		{ addDiagnostic: (diagnostic) => refused.push(diagnostic) },
	);
	let emitted = '';

	program.emit(
		program.getSourceFile(fixture),
		(name, text) => {
			if (name.endsWith(`${path.basename(fileName, '.ts')}.js`)) emitted = text;
		},
		undefined,
		false,
		{ before: [transform] },
	);

	return { emitted, refused };
};

/** Output of the fixture whose every call is provable. */
let accepted: Compiled;

/** Output of the fixture whose every call is not. */
let rejected: Compiled;

beforeAll(() => {
	accepted = compile('constantOf.sample.ts');
	rejected = compile('constantOf.rejected.fixture.ts');
});

/**
 * Evaluates the expression an exported binding was emitted with.
 *
 * @param binding Name of the binding.
 * @returns The value the expression produces.
 */
const evaluate = (binding: string): unknown => {
	const match: RegExpMatchArray | null = accepted.emitted.match(
		new RegExp(`export const ${binding} = (.*);\\r?\\n`),
	);

	if (match === null) throw new Error(`${binding} was not emitted`);

	return new Function(`return ${match[1]};`)();
};

/**
 * Tells whether an object and every object inside it is frozen.
 *
 * @param value Value to inspect.
 * @returns `true` when nothing in it can be changed.
 */
const deeplyFrozen = (value: unknown): boolean =>
	typeof value !== 'object' ||
	value === null ||
	(Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));

/**
 * The line of the fixture a diagnostic points at, trimmed.
 *
 * @param diagnostic The diagnostic.
 * @returns The source line.
 */
const lineOf = (diagnostic: ts.Diagnostic): string => {
	const file = diagnostic.file as ts.SourceFile;
	const { line } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);

	return file.text.split(/\r?\n/)[line].trim();
};

/**
 * The message of the refusal of the call a binding is declared with.
 *
 * @param binding Name of the binding.
 * @returns The message.
 */
const refusalOf = (binding: string): string => {
	const declaration: number =
		rejected.refused.length === 0
			? -1
			: (rejected.refused[0].file as ts.SourceFile).text.indexOf(
					`export const ${binding} =`,
				);
	const found: ts.Diagnostic | undefined = rejected.refused.find(
		(diagnostic) =>
			declaration >= 0 &&
			(diagnostic.start ?? 0) > declaration &&
			// The first refusal after the declaration is its own: every binding
			// of the fixture declares exactly one call.
			!rejected.refused.some(
				(other) =>
					(other.start ?? 0) > declaration &&
					(other.start ?? 0) < (diagnostic.start ?? 0),
			),
	);

	if (found === undefined) throw new Error(`${binding} was not refused`);

	return String(found.messageText);
};

describe('constantOf at compile time', () => {
	describe('what it replaces', () => {
		it('should leave no call behind', () => {
			expect(accepted.emitted).not.toMatch(/constantOf\(/);
			expect(accepted.refused).toEqual([]);
		});

		it('should replace a call with the value its function returns', () => {
			expect(evaluate('squares')).toEqual([1, 4, 9]);
		});

		it('should run loops and let bindings inside the function', () => {
			const table = evaluate('crcTable') as number[];

			expect(table).toHaveLength(256);
			expect(table[1]).toBe(0x77073096);
			expect(table[255]).toBe(0x2d02ef8d);
		});

		it('should follow consts and functions, a recursive one included', () => {
			expect(evaluate('scaled')).toBe(20 + 610);
		});

		it('should follow names across an import, without mixing up equal names', () => {
			expect(evaluate('imported')).toBe(64);
			expect(evaluate('shorthand')).toEqual({ BASE: 10 });
		});

		it('should read another constant', () => {
			expect(evaluate('chained')).toBe(3 + 64);
		});

		it('should write every primitive back exactly', () => {
			const special = evaluate('special') as unknown[];

			expect(special[0]).toBeNaN();
			expect(special.slice(1, 3)).toEqual([Infinity, -Infinity]);
			expect(Object.is(special[3], -0)).toBe(true);
			expect(special.slice(4)).toEqual([
				2n ** 70n,
				-5n,
				undefined,
				null,
				true,
				'text',
			]);
		});

		it('should keep keys that cannot be written bare, __proto__ included, as fields', () => {
			const record = evaluate('record') as Record<string, unknown>;

			expect(Object.keys(record)).toEqual([
				'name',
				'two words',
				'__proto__',
				'nested',
			]);
			expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
			expect(record.nested).toEqual({ list: [1, { deep: true }] });
		});

		it('should freeze what it writes at every level', () => {
			expect(deeplyFrozen(evaluate('record'))).toBe(true);
			expect(deeplyFrozen(evaluate('squares'))).toBe(true);
		});

		it('should take a function by name', () => {
			expect(evaluate('named')).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
		});

		it('should evaluate a function written with types', () => {
			expect(evaluate('typed')).toEqual([1, 2]);
		});

		it('should replace a call inside a function that reads only constants', () => {
			expect(accepted.emitted).toMatch(/export const inside = \(\) => 30;/);
		});

		it('should emit what the runtime computes for the same function', () => {
			expect(evaluate('squares')).toEqual(
				constantOf(() => [1, 2, 3].map((value) => value * value)),
			);
		});
	});

	describe('what it refuses', () => {
		it('should refuse every call of the fixture, and write none of them', () => {
			expect(rejected.refused).toHaveLength(10);
			expect(
				rejected.refused.every(
					(diagnostic) =>
						diagnostic.category === ts.DiagnosticCategory.Error &&
						diagnostic.source === 'fulcro',
				),
			).toBe(true);
			expect(rejected.emitted.match(/constantOf\(/g)).toHaveLength(10);
		});

		it('should refuse a let, which can change', () => {
			expect(refusalOf('fromLet')).toBe(
				"FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. " +
					'Everything the function reads has to be a const, a function or a built-in the compiler can see the source of; ' +
					'compute the value at runtime instead, without constantOf, if it cannot be.',
			);
		});

		it('should refuse a parameter of an enclosing function', () => {
			expect(refusalOf('fromParameter')).toContain("'value' is a parameter");
		});

		it('should refuse a built-in whose answer changes between builds', () => {
			expect(refusalOf('fromDate')).toContain(
				"'Date' is a built-in whose answer can change from one build to the next",
			);
		});

		it('should refuse a value only a declaration file declares', () => {
			expect(refusalOf('fromProcess')).toContain(
				"'process' is only declared in a declaration file",
			);
		});

		it('should refuse a class', () => {
			expect(refusalOf('fromClass')).toContain("'Holder' is a class");
		});

		it('should report what the function threw', () => {
			expect(refusalOf('thrown')).toBe(
				'FULCRO4012: constantOf(…) threw while it was evaluated at compile time: refused on purpose',
			);
		});

		it('should run without Math.random', () => {
			expect(refusalOf('random')).toMatch(/^FULCRO4012: .*random/);
		});

		it('should refuse a result a literal cannot write', () => {
			expect(refusalOf('unwritable')).toBe(
				'FULCRO4011: constantOf(…) produced an instance of Map, which cannot be written as a literal. ' +
					'A constant is a number, a string, a boolean, a bigint, null or undefined, or an array or a plain object of them, each reached once.',
			);
		});

		it('should refuse an argument that is not a function', () => {
			expect(refusalOf('notAFunction')).toContain(
				'its argument is neither a function nor the name of one',
			);
		});

		it('should refuse a constant that reads a refused one', () => {
			expect(refusalOf('dependsOnRefused')).toContain(
				"'fromLet' is a constant that could not be evaluated",
			);
		});

		it('should point each refusal at its own call', () => {
			const lines: string[] = rejected.refused.map(lineOf);

			expect(new Set(lines).size).toBe(lines.length);
			expect(lines.every((line) => line.includes('constantOf('))).toBe(true);
		});

		it('should throw every refusal of a file at once without a place to report them', () => {
			const fixture: string = path.resolve(
				__dirname,
				'constantOf.rejected.fixture.ts',
			);
			const program: ts.Program = ts.createProgram([fixture], COMPILER_OPTIONS);
			const transform = transformer(program, { projectRoot: PROJECT_ROOT });

			let thrown: unknown;

			try {
				program.emit(
					program.getSourceFile(fixture),
					() => undefined,
					undefined,
					false,
					{ before: [transform] },
				);
			} catch (error) {
				thrown = error;
			}

			expect(thrown).toBeInstanceOf(Error);
			expect((thrown as Error).message).toMatch(
				/^FULCRO5003: The Fulcro transformer refused calls it could not answer at compile time:\n/,
			);
			expect((thrown as Error).message.match(/FULCRO401\d/g)).toHaveLength(10);
		});
	});

	describe('what it stops', () => {
		// The case costs the whole five seconds of the limit, and a program to
		// build on top: a ceiling well above both, which only a hang crosses.
		it('should stop a function that never returns, and refuse it', () => {
			const { refused } = compile('constantOf.timeout.fixture.ts');

			expect(
				refused.map((diagnostic) => String(diagnostic.messageText)),
			).toEqual([
				'FULCRO4013: constantOf(…) did not finish within 5000 ms at compile time.',
			]);
		}, 60_000);
	});
});
