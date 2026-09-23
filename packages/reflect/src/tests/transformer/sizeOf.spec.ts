import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite for `sizeOf`.
 *
 * Compiles a fixture with the transformer applied and reads the emitted
 * JavaScript. The fixture imports `@fulcro/reflect` by name, so the call is
 * recognised across the package boundary — through the built declarations — as
 * it is in a consumer's project.
 *
 * The second fixture is the other half of the contract: a type with no layout
 * is refused by the constraint, which is a diagnostic at the call, not a number
 * and not a throw at runtime.
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

/**
 * Compiles a fixture with the transformer applied.
 *
 * @param fileName Fixture beside this suite.
 * @returns The emitted JavaScript and the errors of the program.
 */
const compile = (
	fileName: string,
): { emitted: string; errors: readonly ts.Diagnostic[] } => {
	const fixture: string = path.resolve(__dirname, fileName);
	const program: ts.Program = ts.createProgram([fixture], COMPILER_OPTIONS);

	let emitted = '';

	program.emit(
		program.getSourceFile(fixture),
		(name, text) => {
			if (name.endsWith('.js')) emitted = text;
		},
		undefined,
		false,
		{ before: [transformer(program, { projectRoot: PROJECT_ROOT })] },
	);

	const errors: readonly ts.Diagnostic[] = ts
		.getPreEmitDiagnostics(program)
		.filter(
			(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
		);

	return { emitted, errors };
};

/** Output of the fixture that compiles. */
let accepted: { emitted: string; errors: readonly ts.Diagnostic[] };

/** Output of the fixture that must not. */
let rejected: { emitted: string; errors: readonly ts.Diagnostic[] };

beforeAll(() => {
	accepted = compile('layout.sample.ts');
	rejected = compile('layout.rejected.fixture.ts');
});

describe('sizeOf at compile time', () => {
	it('should compile the fixture without errors', () => {
		expect(
			accepted.errors.map((error) =>
				ts.flattenDiagnosticMessageText(error.messageText, '\n'),
			),
		).toEqual([]);
	});

	it('should replace each call with the size the type declares', () => {
		expect(accepted.emitted).toContain('export const halfSize = 2;');
		expect(accepted.emitted).toContain('export const declaredSize = 12;');
	});

	it('should leave a union of different layouts as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const mixedSize = \(\) => sizeOf\(\);/,
		);
	});

	it('should leave a generic parameter as a call', () => {
		expect(accepted.emitted).toMatch(
			/export const genericSize = \(\) => sizeOf\(\);/,
		);
	});

	it('should leave a local function of the same name alone', () => {
		expect(accepted.emitted).toContain('return sizeOf();');
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
			});

		expect(refused).toEqual([
			'export const stringSize = sizeOf<string>();',
			'export const bigintSize = sizeOf<bigint>();',
			'export const objectAlignment = alignOf<{ readonly size: 4 }>();',
		]);
	});
});
