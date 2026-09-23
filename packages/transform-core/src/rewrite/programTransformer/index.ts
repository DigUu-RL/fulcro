import typescript from 'typescript';

import { type ExpressionRewriter } from '@/rewrite/file';
import { type ProgramRewrite, rewriteToFixpoint } from '@/rewrite/fixpoint';

/**
 * The `tsc` integration of a rewrite that has to happen before type checking.
 *
 * `ts-patch` offers two kinds of plugin. The ordinary one, a `before`
 * transformer, runs on a program that has already been type checked, which is
 * too late: `decimal * decimal` has been reported as an error by then. The other
 * — `"transformProgram": true` in the tsconfig entry — is handed the program as
 * it is created and returns the one `tsc` goes on to check and emit. That is
 * where this runs: it rewrites the program to a fixed point and returns the
 * rewritten one, so what gets checked is what the rewrite produced.
 *
 * ```json
 * { "plugins": [{ "transform": "@fulcro/types/transformer", "transformProgram": true }] }
 * ```
 */

/** The shape `ts-patch` expects from a program transformer. */
export type ProgramTransformer = (
	program: typescript.Program,
	host?: typescript.CompilerHost,
	config?: unknown,
	extras?: unknown,
) => typescript.Program;

/**
 * Serves the rewritten texts in place of the files on disk, and parses each
 * once per text.
 *
 * @param base Host the program was created with.
 * @param texts Rewritten texts by file name.
 * @param languageVersion Target the files are parsed for.
 * @param seed Program whose files are reused as they are.
 * @returns A host reading through the rewrite.
 */
const overlayHost = (
	base: typescript.CompilerHost,
	texts: ReadonlyMap<string, string>,
	languageVersion: typescript.ScriptTarget,
	seed: typescript.Program,
): typescript.CompilerHost => {
	const parsed = new Map<string, typescript.SourceFile>();

	// Every file the rewrite did not touch is handed back as the same object on
	// every pass. `createProgram` reuses an old program's file only when the
	// host returns the identical object, so a host that parsed the standard
	// library afresh each time would make every pass re-check it from nothing.
	const unchanged = new Map<string, typescript.SourceFile | undefined>(
		seed.getSourceFiles().map((file) => [file.fileName, file]),
	);

	return {
		...base,

		getSourceFile: (fileName, options, onError, shouldCreate) => {
			const text: string | undefined = texts.get(fileName);

			if (text === undefined) {
				if (!unchanged.has(fileName)) {
					unchanged.set(
						fileName,
						base.getSourceFile(fileName, options, onError, shouldCreate),
					);
				}

				return unchanged.get(fileName);
			}

			const cached: typescript.SourceFile | undefined = parsed.get(fileName);

			if (cached !== undefined && cached.text === text) return cached;

			const sourceFile: typescript.SourceFile = typescript.createSourceFile(
				fileName,
				text,
				typeof options === 'object' ? options : languageVersion,
				true,
			);

			parsed.set(fileName, sourceFile);

			return sourceFile;
		},

		readFile: (fileName) => texts.get(fileName) ?? base.readFile(fileName),

		fileExists: (fileName) => texts.has(fileName) || base.fileExists(fileName),
	};
};

/**
 * Rewrites an existing program, returning the rewritten program with what the
 * rewrite did.
 *
 * @param program Program to rewrite.
 * @param host Host it was created with; a default one when not given.
 * @param rewriter What to rewrite.
 * @returns The rewritten program, and the rewrite.
 */
export const rewriteProgram = (
	program: typescript.Program,
	host: typescript.CompilerHost | undefined,
	rewriter: ExpressionRewriter,
): {
	readonly program: typescript.Program;
	readonly rewrite: ProgramRewrite;
} => {
	const options: typescript.CompilerOptions = program.getCompilerOptions();
	const base: typescript.CompilerHost =
		host ?? typescript.createCompilerHost(options, true);
	const texts = new Map<string, string>();
	const overlay: typescript.CompilerHost = overlayHost(
		base,
		texts,
		options.target ?? typescript.ScriptTarget.ES2022,
		program,
	);

	let current: typescript.Program = program;
	let stale = false;

	const rewrite: ProgramRewrite = rewriteToFixpoint(
		{
			program: () => {
				if (stale) {
					current = typescript.createProgram({
						rootNames: program.getRootFileNames(),
						options,
						host: overlay,
						oldProgram: current,
						projectReferences: program.getProjectReferences(),
					});
					stale = false;
				}

				return current;
			},
			update: (fileName, text) => {
				texts.set(fileName, text);
				stale = true;
			},
		},
		rewriter,
	);

	return { program: current, rewrite };
};

/**
 * Builds the program transformer of a rewriter.
 *
 * Guarded against itself: the new program is made with `createProgram`, which
 * `ts-patch` has patched to run program transformers, so without the guard the
 * transformer would be invoked on its own output, recursively.
 *
 * @param rewriter What to rewrite.
 * @returns The program transformer, as `ts-patch` expects it.
 */
export const createProgramTransformer = (
	rewriter: ExpressionRewriter,
): ProgramTransformer => {
	let running = false;

	return (program, host) => {
		if (running) return program;

		running = true;

		try {
			return rewriteProgram(program, host, rewriter).program;
		} finally {
			running = false;
		}
	};
};
