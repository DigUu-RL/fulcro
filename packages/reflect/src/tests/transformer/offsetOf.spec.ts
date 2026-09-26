import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite for `offsetOf`.
 *
 * Compiles a fixture with the transformer applied and reads the emitted
 * JavaScript. The fixture imports `@fulcro/reflect` by name, so the call is
 * recognised across the package boundary — through the built declarations — as
 * it is in a consumer's project.
 *
 * The offsets are not in the fixture's types: each struct lists its fields'
 * sizes and alignments only, so every number below was placed by the
 * transformer, from the order the fields were written in.
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

describe('offsetOf at compile time', () => {
	it('should compile the fixture without errors', () => {
		expect(
			accepted.errors.map((error) =>
				ts.flattenDiagnosticMessageText(error.messageText, '\n'),
			),
		).toEqual([]);
	});

	it('should place the fields by alignment, largest first', () => {
		expect(accepted.emitted).toContain('export const weightOffset = 0;');
		expect(accepted.emitted).toContain('export const countOffset = 8;');
		expect(accepted.emitted).toContain('export const flagOffset = 10;');
	});

	it('should keep declaration order among fields of one alignment', () => {
		expect(accepted.emitted).toContain('export const vectorY = 4;');
		expect(accepted.emitted).toContain('export const reversedX = 8;');
		expect(accepted.emitted).toContain('export const reversedZ = 0;');
	});

	it('should leave a field held in a variable as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const heldInVariable = \(\) => offsetOf\(held\);/,
		);
	});

	it('should leave a generic parameter as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const genericOffset = \(\) => offsetOf\('flag'\);/,
		);
	});

	it('should leave a union of structs placing the field differently as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const unionOffset = \(\) => offsetOf\('x'\);/,
		);
	});

	it('should leave a local function of the same name alone', () => {
		expect(accepted.emitted).toContain("return offsetOf('flag');");
	});

	it('should refuse a name that is not a field, and a type without fields, at the call site', () => {
		const refused: string[] = rejected.errors
			.filter((error) => error.code === 2344 || error.code === 2345)
			.map((error) => {
				const { line } = ts.getLineAndCharacterOfPosition(
					error.file as ts.SourceFile,
					error.start ?? 0,
				);

				return (error.file as ts.SourceFile).text.split(/\r?\n/)[line].trim();
			})
			.filter((line) => line.includes('offsetOf'));

		expect(refused).toEqual([
			"export const missingField = offsetOf<Point>('z');",
			"export const methodField = offsetOf<Point>('length');",
			"export const layoutField = offsetOf<Point>('~layout');",
			"export const numericField = offsetOf<Single>('x');",
		]);
	});
});
