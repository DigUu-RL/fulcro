import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Compiles `struct.sample.ts` with both plugins applied, as a consumer using
 * both libraries compiles it, and runs what came out.
 *
 * Shared by the `offsetOf` and `layoutOf` suites, which assert on different
 * halves of the same output. The output is turned into CommonJS so it can be
 * run here, with the `require` of this directory — which resolves
 * `@fulcro/reflect` and `@fulcro/types` to their built output, through
 * `node_modules`.
 */

/** Resolves the built packages the way a consumer's compiler would. */
const require = createRequire(import.meta.url);

/** Fixture fed to the compiler. */
const FIXTURE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'struct.sample.ts',
);

/** What compiling and running the fixture produced. */
export interface CompiledStructs {
	/** The JavaScript emitted. */
	readonly emitted: string;
	/** What the emitted module exported, once run. */
	readonly exports: Record<string, unknown>;
}

/**
 * Compiles the fixture and runs it.
 *
 * @returns The emitted JavaScript and the module's exports.
 * @throws {Error} When the fixture does not compile cleanly.
 */
export const compileStructs = (): CompiledStructs => {
	const reflect = require('@fulcro/reflect/transformer').default as (
		program: ts.Program,
	) => ts.TransformerFactory<ts.SourceFile>;
	const collections = require('@fulcro/collections/transformer')
		.default as typeof reflect;

	const program: ts.Program = ts.createProgram([FIXTURE], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		// `Bundler`, because `Node10` finds a package's main entry but not its
		// `exports` subpaths, and it only accepts an ES module target.
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
			errors
				.map((error) =>
					ts.flattenDiagnosticMessageText(error.messageText, '\n'),
				)
				.join('\n'),
		);
	}

	let emitted = '';

	program.emit(
		program.getSourceFile(FIXTURE),
		(fileName, text) => {
			if (fileName.endsWith('.js')) emitted = text;
		},
		undefined,
		false,
		{ before: [reflect(program), collections(program)] },
	);

	// Only the module syntax changes here; the transformers have already run.
	const runnable: string = ts.transpileModule(emitted, {
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.CommonJS,
		},
	}).outputText;
	const module = { exports: {} as Record<string, unknown> };

	new Function('require', 'module', 'exports', runnable)(
		require,
		module,
		module.exports,
	);

	return { emitted, exports: module.exports };
};
