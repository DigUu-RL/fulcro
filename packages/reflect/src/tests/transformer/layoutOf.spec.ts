import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite for `layoutOf`.
 *
 * Compiles a fixture with the transformer applied, then evaluates the literal
 * each resolved call was replaced by — the object a consumer's code receives —
 * rather than matching its text, so the assertions hold whatever the printer
 * does with whitespace.
 */

/** Root of the package, which the reported declaration paths are relative to. */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** Options every fixture compiles with. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	// An ESNext module defaults to the classic resolution, which never finds a
	// package's `index` — the import would resolve to nothing.
	moduleResolution: ts.ModuleResolutionKind.Node10,
	strict: true,
	noEmitOnError: false,
	skipLibCheck: true,
};

/** What compiling one fixture produced. */
interface Compiled {
	readonly emitted: string;
	readonly errors: readonly ts.Diagnostic[];
}

/**
 * Compiles fixtures with the transformer applied, in one program.
 *
 * One program for all of them, because building it is what costs: each one
 * loads the standard library and the built declarations again.
 *
 * @param fileNames Fixtures beside this suite.
 * @returns For each fixture, its emitted JavaScript and its errors.
 */
const compile = (...fileNames: string[]): Compiled[] => {
	const fixtures: string[] = fileNames.map((fileName) =>
		path.resolve(__dirname, fileName),
	);
	const program: ts.Program = ts.createProgram(fixtures, COMPILER_OPTIONS);
	const transform = transformer(program, { projectRoot: PROJECT_ROOT });

	return fixtures.map((fixture) => {
		const source = program.getSourceFile(fixture) as ts.SourceFile;
		let emitted = '';

		program.emit(
			source,
			(name, text) => {
				if (name.endsWith('.js')) emitted = text;
			},
			undefined,
			false,
			{ before: [transform] },
		);

		const errors: readonly ts.Diagnostic[] = ts
			.getPreEmitDiagnostics(program, source)
			.filter(
				(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
			);

		return { emitted, errors };
	});
};

/** Output of the fixture that compiles. */
let accepted: Compiled;

/** Output of the fixture that must not. */
let rejected: Compiled;

beforeAll(() => {
	[accepted, rejected] = compile(
		'fieldLayout.sample.ts',
		'fieldLayout.rejected.fixture.ts',
	);
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

describe('layoutOf at compile time', () => {
	it('should compile the fixture without errors', () => {
		expect(
			accepted.errors.map((error) =>
				ts.flattenDiagnosticMessageText(error.messageText, '\n'),
			),
		).toEqual([]);
	});

	it('should replace the call with the layout, the fields placed', () => {
		expect(evaluate('mixedLayout')).toEqual({
			size: 16,
			alignment: 8,
			fields: {
				flag: { offset: 10, size: 1, alignment: 1 },
				weight: { offset: 0, size: 8, alignment: 8 },
				count: { offset: 8, size: 2, alignment: 2 },
			},
		});
	});

	it('should list the fields in declaration order, not placement order', () => {
		const layout = evaluate('mixedLayout') as { fields: object };

		expect(Object.keys(layout.fields)).toEqual(['flag', 'weight', 'count']);
	});

	it('should freeze the layout at every level', () => {
		expect(deeplyFrozen(evaluate('mixedLayout'))).toBe(true);
		expect(deeplyFrozen(evaluate('singleLayout'))).toBe(true);
	});

	it('should report a type without fields with none', () => {
		expect(evaluate('singleLayout')).toEqual({
			size: 4,
			alignment: 4,
			fields: {},
		});
	});

	it('should keep a field whose name cannot be written bare as a field', () => {
		const { fields } = evaluate('quotedLayout') as { fields: object };

		expect(Object.keys(fields)).toEqual(['two words', '__proto__']);
		expect(Object.getPrototypeOf(fields)).toBe(Object.prototype);
	});

	it('should leave a generic parameter as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const genericLayout = \(\) => layoutOf\(\);/,
		);
	});

	it('should leave a union of structs placing their fields differently as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const unionLayout = \(\) => layoutOf\(\);/,
		);
	});

	it('should refuse a type with no layout at the call site', () => {
		const refused: string[] = rejected.errors
			.filter((error) => error.code === 2344)
			.map((error) => {
				const { line } = ts.getLineAndCharacterOfPosition(
					error.file as ts.SourceFile,
					error.start ?? 0,
				);

				return (error.file as ts.SourceFile).text.split(/\r?\n/)[line].trim();
			})
			.filter((line) => line.includes('layoutOf'));

		expect(refused).toEqual([
			'export const stringLayout = layoutOf<string>();',
		]);
	});
});
