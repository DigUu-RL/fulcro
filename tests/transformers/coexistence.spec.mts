import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Coexistence suite.
 *
 * Each package tests its own transformer alone, which proves each one works and
 * proves nothing about the two together. A consumer using both libraries
 * applies both plugins to the same compilation, and there is no other coverage
 * of that: they walk the same tree, and one replacing a node the other still
 * needed to visit would break quietly — the file would compile, the call would
 * be left as written, and only a runtime refusal much later would say so.
 *
 * So this compiles one fixture with both applied and asserts that **every** call
 * came out resolved.
 */

/** Resolves the built packages the way a consumer's compiler would. */
const require = createRequire(import.meta.url);

/** Root of the repository, which this file sits two levels below. */
const ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../..',
);

/** Fixture fed to the compiler. */
const FIXTURE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'coexistence.sample.ts',
);

/** JavaScript emitted for the fixture, shared by every assertion. */
let emitted = '';

/**
 * Compiles the fixture with both transformers applied.
 *
 * @returns The emitted JavaScript.
 */
const compileFixture = (): string => {
	const reflect = require('@fulcro/reflect/transformer')
		.default as ts.TransformerFactory<ts.SourceFile> extends never
		? never
		: (program: ts.Program) => ts.TransformerFactory<ts.SourceFile>;

	const collections = require('@fulcro/collections/transformer')
		.default as typeof reflect;

	const program: ts.Program = ts.createProgram([FIXTURE], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		// `Bundler`, because `Node10` finds a package's main entry but not its
		// `exports` subpaths — and a type the checker cannot see is a call
		// neither transformer can claim, silently.
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	const errors: readonly ts.Diagnostic[] = ts
		.getPreEmitDiagnostics(program, program.getSourceFile(FIXTURE))
		.filter(
			(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
		);

	if (errors.length > 0) {
		throw new Error(
			ts.formatDiagnostics(errors, {
				getCanonicalFileName: (name) => name,
				getCurrentDirectory: () => ROOT,
				getNewLine: () => '\n',
			}),
		);
	}

	let output = '';

	program.emit(
		program.getSourceFile(FIXTURE),
		(fileName, text) => {
			if (fileName.endsWith('.js')) output = text;
		},
		undefined,
		false,
		// Both, in one pass over one tree. The order is deliberate and
		// arbitrary: neither should depend on running first.
		{ before: [reflect(program), collections(program)] },
	);

	return output;
};

beforeAll(() => {
	emitted = compileFixture();
});

describe('both plugins on one file', () => {
	it('should resolve the calls @fulcro/reflect owns', () => {
		expect(emitted).toMatch(/is\(payload, \{ name: "Order"/);
		expect(emitted).toMatch(/as\(payload, \{ name: "Order"/);
	});

	it('should resolve the calls @fulcro/collections owns', () => {
		expect(emitted).toMatch(/\.ofType\(\{ name: "Order"/);
		expect(emitted).toMatch(/\.cast\(\{ name: "Order"/);
	});

	it('should still replace the calls that are replaced outright', () => {
		// `defaultOf` and `nameOf` are substituted rather than given an argument,
		// so they exercise a different path through the same walk.
		expect(emitted).toContain('id: 0');
		expect(emitted).toContain('"Order"');
	});

	it('should resolve both inside one expression', () => {
		// Where interference would actually show: a rewritten call sitting inside
		// another rewritten call, each claimed by a different plugin.
		//
		// Read as a block rather than a line. A chain is emitted across several
		// of them, and a line-wise search finds only `SequenceCollection.from(rows)`
		// — which would have made this pass or fail on formatting.
		const start: number = emitted.indexOf('export const together');

		expect(start).toBeGreaterThan(-1);

		const block: string = emitted.slice(start);

		expect(block).toMatch(/\.ofType\(\{ name: "Order"/);
		expect(block).toMatch(/is\(order, \{ name: "Order"/);
	});

	it('should leave nothing unresolved', () => {
		// The assertion that makes the rest mean something. A call left as
		// written is exactly what silent interference looks like, and counting
		// them catches a form neither of the named cases above covers.
		const unresolved: readonly string[] =
			emitted.match(/\b(is|as)\([^,)]*\)|\.(ofType|cast)\(\)/g) ?? [];

		expect(unresolved).toEqual([]);
	});
});
