import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import * as ts from 'typescript';

import transformer from '@/transformer';

/**
 * Compiles the operator fixtures the way `tsc` with the plugin does, and runs
 * them.
 *
 * The fixtures only type check once rewritten — `decimal * decimal` is an error
 * to the plain checker — so they are excluded from the package's typecheck and
 * compiled here instead, through the program transformer, which is the same
 * code `ts-patch` calls. Each imports `@fulcro/types` by name, so the rewrite
 * recognises the types through the built declarations, across the package
 * boundary, as it does in a consumer's project.
 *
 * All of them are compiled as one program, once: that is what a project is,
 * and building the standard library into a program per fixture would cost the
 * suites a second each for nothing.
 */

/** Directory of the fixtures. */
export const FIXTURES: string = path.resolve(__dirname, '..', 'operators');

/** Every fixture, by the name the suites use. */
export const FIXTURE_NAMES = [
	'integers',
	'floats',
	'decimal',
	'mixed',
	'untouched',
] as const;

/** One fixture's name. */
export type FixtureName = (typeof FIXTURE_NAMES)[number];

/** What compiling a fixture produced. */
export interface Compiled {
	/** The fixture as written. */
	readonly original: string;

	/** The rewritten TypeScript. */
	readonly rewritten: string;

	/** Errors of the rewritten file, as `line: message`. */
	readonly errors: readonly string[];

	/** Runs the emitted JavaScript and returns its exports. */
	readonly run: () => Record<string, unknown>;
}

/** Options the fixtures compile with, as a consumer's project might set them. */
export const COMPILER_OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.CommonJS,
	moduleResolution: ts.ModuleResolutionKind.Node10,
	strict: true,
	skipLibCheck: true,
	noEmitOnError: false,
};

/**
 * Path of a fixture.
 *
 * @param name The fixture.
 * @returns Its file name.
 */
export const fixturePath = (name: FixtureName): string =>
	path.join(FIXTURES, `${name}.fixture.ts`);

/**
 * The lines of a fixture marked `// error`, which are the lines an error has to
 * be reported on. Read from the fixture rather than written into a suite, so a
 * formatter moving the lines moves the expectation with them.
 *
 * @param name The fixture.
 * @returns One-based line numbers.
 */
export const markedLines = (name: FixtureName): number[] =>
	readFileSync(fixturePath(name), 'utf8')
		.split('\n')
		.flatMap((line, index) => (/\/\/ error\b/.test(line) ? [index + 1] : []));

/**
 * Runs emitted CommonJS as the module it is, beside the fixture it came from.
 *
 * @param fileName File the code was emitted for, which its imports resolve from.
 * @param code The JavaScript.
 * @returns Its exports.
 */
export const runModule = (
	fileName: string,
	code: string,
): Record<string, unknown> => {
	const module = { exports: {} as Record<string, unknown> };

	new Function('require', 'module', 'exports', code)(
		createRequire(fileName),
		module,
		module.exports,
	);

	return module.exports;
};

let compiled: ReadonlyMap<FixtureName, Compiled> | undefined;

/**
 * Compiles every fixture, once per run.
 *
 * @returns Each fixture's result, by name.
 */
const compileAll = (): ReadonlyMap<FixtureName, Compiled> => {
	if (compiled !== undefined) return compiled;

	const fileNames: string[] = FIXTURE_NAMES.map(fixturePath);
	const original: ts.Program = ts.createProgram(fileNames, COMPILER_OPTIONS);
	const program: ts.Program = transformer(original);
	const results = new Map<FixtureName, Compiled>();

	for (const name of FIXTURE_NAMES) {
		const fileName: string = fixturePath(name);
		const sourceFile = program.getSourceFile(fileName) as ts.SourceFile;

		const errors: string[] = ts
			.getPreEmitDiagnostics(program, sourceFile)
			.filter(
				(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
			)
			.map((diagnostic) => {
				const line: number =
					diagnostic.start === undefined
						? 0
						: sourceFile.getLineAndCharacterOfPosition(diagnostic.start).line +
							1;

				return `${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`;
			});

		let emitted = '';

		program.emit(sourceFile, (output, text) => {
			if (output.endsWith('.js')) emitted = text;
		});

		results.set(name, {
			original: (original.getSourceFile(fileName) as ts.SourceFile).text,
			rewritten: sourceFile.text,
			errors,
			run: () => runModule(fileName, emitted),
		});
	}

	compiled = results;

	return results;
};

/**
 * The compilation of one fixture.
 *
 * @param name The fixture.
 * @returns What compiling it produced.
 */
export const compile = (name: FixtureName): Compiled =>
	compileAll().get(name) as Compiled;
