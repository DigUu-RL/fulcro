import * as fs from 'node:fs';
import * as path from 'node:path';

import typescript from 'typescript';

import {
	type FileTransformer,
	parseTsconfig,
	ProgramHost,
	toCompilerPath,
	type TransformCoreOptions,
} from '@/program';
import { type ExpressionRewriter } from '@/rewrite/file';
import {
	isRewritable,
	type ProgramRewrite,
	rewriteToFixpoint,
} from '@/rewrite/fixpoint';

/**
 * The bundler integration of a rewrite that has to happen before type
 * checking.
 *
 * A bundler never type checks — esbuild and swc erase the types — so an error
 * the checker would raise on `decimal * decimal` never stops it. What it does
 * need is the rewrite itself, and that needs the whole program: whether `c + d`
 * in one file is claimable depends on how `c` was declared in another. So the
 * first file to arrive rewrites the whole program to a fixed point, and every
 * file after it is answered from that until some file changes.
 */

/** Extensions carrying TypeScript this transformer is responsible for. */
const HANDLED_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx'];

/**
 * Creates the bundler core of a rewriter.
 *
 * @param rewriter What to rewrite.
 * @param options Options of the core.
 * @returns A transformer any bundler adapter can drive.
 */
export const createRewritingFileTransformer = (
	rewriter: ExpressionRewriter,
	options: TransformCoreOptions = {},
): FileTransformer => {
	const root: string = options.root ?? process.cwd();

	let host: ProgramHost | undefined;
	let service: typescript.LanguageService | undefined;
	let rewrite: ProgramRewrite | undefined;

	/** What the bundler last handed over for each file, before any rewrite. */
	const originals = new Map<string, string>();

	const handles = (id: string): boolean => {
		const fileName: string = id.split('?')[0];

		if (!HANDLED_EXTENSIONS.includes(path.extname(fileName))) return false;

		return !fileName.includes('node_modules');
	};

	/**
	 * Puts every rewritten file back to its original text, so the next rewrite
	 * starts from what the author wrote rather than from its own output.
	 *
	 * @param programHost The host holding the texts.
	 */
	const restore = (programHost: ProgramHost): void => {
		for (const fileName of rewrite?.files.keys() ?? []) {
			const text: string | undefined =
				originals.get(fileName) ??
				(fs.existsSync(fileName)
					? fs.readFileSync(fileName, 'utf8')
					: undefined);

			if (text !== undefined) programHost.update(fileName, text);
		}

		rewrite = undefined;
	};

	const transform = (id: string, code: string): string | null => {
		if (!handles(id)) return null;

		const fileName: string = toCompilerPath(id.split('?')[0]);

		if (host === undefined || service === undefined) {
			host = new ProgramHost(parseTsconfig(root, options.tsconfig), root);
			service = typescript.createLanguageService(
				host,
				typescript.createDocumentRegistry(),
			);
		}

		if (originals.get(fileName) !== code) {
			originals.set(fileName, code);
			restore(host);
			host.update(fileName, code);
		}

		if (rewrite === undefined) {
			const programHost: ProgramHost = host;
			const languageService: typescript.LanguageService = service;

			rewrite = rewriteToFixpoint(
				{
					program: () => {
						const program: typescript.Program | undefined =
							languageService.getProgram();

						if (program === undefined) {
							throw new Error(
								`The language service produced no program for ${root}.`,
							);
						}

						return program;
					},
					update: (name, text) => programHost.update(name, text),
				},
				rewriter,
			);
		}

		const sourceFile: typescript.SourceFile | undefined = service
			.getProgram()
			?.getSourceFile(fileName);

		if (sourceFile !== undefined && !isRewritable(sourceFile)) return null;

		return rewrite.files.get(fileName)?.text ?? null;
	};

	return { handles, transform };
};
