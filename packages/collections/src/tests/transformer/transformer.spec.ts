import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite.
 *
 * The transformer runs inside the compiler, so it is exercised the only way
 * that proves anything: a fixture is compiled with it and the emitted
 * JavaScript is asserted on. Nothing here imports the fixture at runtime.
 *
 * The fixture imports `@fulcro/collections` by name, so the program below
 * resolves it through `node_modules` into the built declarations of that
 * package. That matters more here than it does for `@fulcro/reflect`: these are
 * **method** calls, claimed by following the method symbol back to the
 * `Sequence` declaration rather than by following an import. A same-tree
 * relative import would never exercise the path that actually ships.
 */

/** Root of the package, which the reported declaration paths are relative to. */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** Fixture fed to the compiler. */
const FIXTURE_PATH = path.resolve(__dirname, 'fixture.sample.ts');

/** JavaScript emitted for the fixture, shared by every assertion. */
let emitted = '';

/**
 * Compiles the fixture with the transformer applied.
 *
 * @returns The emitted JavaScript.
 */
const compileFixture = (): string => {
	const program: ts.Program = ts.createProgram([FIXTURE_PATH], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		// Required: an ESNext module defaults to the classic resolution, which
		// never looks for an `index.ts` inside a directory, and the import of the
		// fixture would silently resolve to nothing — leaving the transformer
		// with symbols it cannot trace back to our modules.
		moduleResolution: ts.ModuleResolutionKind.Node10,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	let output = '';

	const result: ts.EmitResult = program.emit(
		program.getSourceFile(FIXTURE_PATH),
		(fileName, text) => {
			if (fileName.endsWith('.js')) output = text;
		},
		undefined,
		false,
		{
			before: [transformer(program, { projectRoot: PROJECT_ROOT })],
		},
	);

	const errors: readonly ts.Diagnostic[] = result.diagnostics.filter(
		(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
	);

	if (errors.length > 0) {
		throw new Error(
			ts.formatDiagnostics(errors, {
				getCanonicalFileName: (name) => name,
				getCurrentDirectory: () => PROJECT_ROOT,
				getNewLine: () => '\n',
			}),
		);
	}

	return output;
};

beforeAll(() => {
	emitted = compileFixture();
});

describe('ofType at compile time', () => {
	it('should turn a primitive type argument into a typeof name', () => {
		// Quote-agnostic: which quotes the printer chooses is its business, and
		// asserting on them would make this fail over a cosmetic change.
		expect(emitted).toMatch(/\.ofType\(['"]string['"]\)/);
	});

	it('should turn a class type argument into the constructor itself', () => {
		// A reference to the value, not its name as a string: `instanceof` needs
		// the binding, and the binding is what survives into the emitted code.
		expect(emitted).toContain('.ofType(Admin)');
	});

	it('should leave a call that was already given a token alone', () => {
		expect(emitted).toMatch(/\.ofType\(['"]number['"]\)/);
	});

	it('should resolve every call it claims', () => {
		// One unresolved call is expected — the interface below — and exactly
		// one. A second would mean a form that should have been rewritten was
		// quietly skipped, which is the failure this whole suite exists to catch
		// and the one that looks like nothing at compile time.
		const unresolved: number = (emitted.match(/\.(ofType|cast)\(\)/g) ?? [])
			.length;

		expect(unresolved).toBe(1);
	});
});

describe('cast at compile time', () => {
	it('should resolve a primitive the same way', () => {
		expect(emitted).toMatch(/\.cast\(['"]string['"]\)/);
	});

	it('should resolve a class the same way', () => {
		expect(emitted).toContain('.cast(Admin)');
	});
});

describe('what it refuses to resolve', () => {
	it('should leave an interface untouched, for the runtime to refuse', () => {
		// An interface has no runtime form, so there is no honest token to emit.
		// The call is left as written and reaches a runtime that throws naming
		// both reasons it could have arrived unresolved.
		const accounts: string =
			emitted.slice(emitted.indexOf('export const accounts')) ?? '';

		expect(accounts).toContain('.ofType()');
	});
});

describe('chained calls', () => {
	it('should rewrite both halves of a chain', () => {
		// The rewriter visits the expression it is called on, so a rewritten call
		// sitting inside another is not skipped.
		expect(emitted).toMatch(
			/\.ofType\(['"]string['"]\)\.cast\(['"]string['"]\)/,
		);
	});
});
