import * as fs from 'node:fs';
import * as path from 'node:path';

import typescript from 'typescript';

import { CallRewriter } from '@/shared';
import { createTransformer, TransformerOptions } from '@/transformer';

/**
 * Type checking core shared by every bundler integration.
 *
 * The transformer needs a type checker, and no bundler has one: esbuild and swc
 * reach TypeScript by erasing its types, never by resolving them, so a plugin
 * cannot simply hand them a transformer and expect `defaultOf<Order>()` to mean
 * anything. This module therefore builds and keeps its own program, and
 * transforms each file itself.
 *
 * Nothing here knows about any bundler: the adapters built on top only have to
 * call {@link createFileTransformer} and hand back what it returns. Kept as
 * CommonJS as well, because the compiler plugin loads it through `require`.
 */

/** Extensions carrying TypeScript this core is responsible for. */
const HANDLED_EXTENSIONS = ['.ts', '.mts', '.cts'];

/**
 * Builds the cheap pre-filter that skips files with nothing to rewrite.
 *
 * Reading a file is far cheaper than type checking it, so a source mentioning
 * none of the owned function names never reaches the program. Derived from the
 * rewriters rather than written out, because each package brings its own names
 * and this core belongs to none of them.
 *
 * @param rewriters Rewriters the core was built with.
 * @returns A pattern matching any of their function names as a whole word.
 */
const buildUtilityPattern = (rewriters: readonly CallRewriter[]): RegExp => {
	const names: string = rewriters
		.map((rewriter) => rewriter.functionName)
		.join('|');

	return new RegExp(`\\b(${names})\\b`);
};

/**
 * Rewrites a path the way the compiler spells it.
 *
 * TypeScript keeps every file name with forward slashes, on every platform,
 * while the bundler and `path.normalize` hand back the native separator. Mixing
 * the two silently defeats every lookup against the files of the program: a
 * file already in it looks new, gets added as another root, and invalidates the
 * whole program — turning one startup cost into one per file.
 *
 * @param fileName Path in whatever spelling it arrived.
 * @returns The path as the compiler spells it.
 */
export const toCompilerPath = (fileName: string): string =>
	path.resolve(fileName).split(path.sep).join('/');

/**
 * Keeps a TypeScript program alive across recompilations.
 *
 * A language service rather than a one shot program: a watch run recompiles the
 * same files repeatedly, and rebuilding the whole program on each edit would
 * cost seconds every keystroke. The service reuses everything that did not
 * change, and the version counters below are what tell it what did.
 */
export class ProgramHost implements typescript.LanguageServiceHost {
	/** Files of the program, as resolved from the tsconfig. */
	private readonly rootNames: string[];

	/** Compiler options resolved from the tsconfig. */
	private readonly options: typescript.CompilerOptions;

	/** Content handed over by the bundler, which may be ahead of the disk. */
	private readonly overlays = new Map<string, string>();

	/** Bumped whenever a file changes, which is how the service invalidates. */
	private readonly versions = new Map<string, number>();

	/** Directory the relative paths of the program resolve against. */
	private readonly currentDirectory: string;

	/**
	 * Initializes the host from a parsed tsconfig.
	 *
	 * @param parsed Parsed contents of the tsconfig.
	 * @param currentDirectory Directory the program resolves against.
	 */
	constructor(parsed: typescript.ParsedCommandLine, currentDirectory: string) {
		this.rootNames = parsed.fileNames.map(toCompilerPath);
		this.options = parsed.options;
		this.currentDirectory = currentDirectory;
	}

	/**
	 * Records the content of a file as the bundler sees it.
	 *
	 * @param fileName File being compiled.
	 * @param content Current content of the file.
	 */
	update(fileName: string, content: string): void {
		if (this.overlays.get(fileName) === content) return;

		// On a cold run the bundler hands over exactly what is on disk, for
		// every file of the project. Recording those as changes would
		// invalidate and re-check the program once per file, turning a single
		// startup cost into a quadratic one — so an unchanged file is left
		// alone and stays at the version the program was built with.
		if (
			!this.overlays.has(fileName) &&
			this.rootNames.includes(fileName) &&
			this.matchesDisk(fileName, content)
		) {
			return;
		}

		this.overlays.set(fileName, content);
		this.versions.set(fileName, (this.versions.get(fileName) ?? 0) + 1);

		// A file the tsconfig never listed — created after startup, or simply
		// excluded — still has to enter the program to be transformed.
		if (!this.rootNames.includes(fileName)) this.rootNames.push(fileName);
	}

	/**
	 * Tells whether the content handed over matches what is on disk.
	 *
	 * @param fileName File being compiled.
	 * @param content Content handed over by the bundler.
	 * @returns `true` when the two are identical.
	 */
	private matchesDisk(fileName: string, content: string): boolean {
		try {
			return fs.readFileSync(fileName, 'utf8') === content;
		} catch {
			return false;
		}
	}

	getScriptFileNames(): string[] {
		return this.rootNames;
	}

	getScriptVersion(fileName: string): string {
		return String(this.versions.get(fileName) ?? 0);
	}

	getScriptSnapshot(fileName: string): typescript.IScriptSnapshot | undefined {
		const overlay: string | undefined = this.overlays.get(fileName);

		if (overlay !== undefined) {
			return typescript.ScriptSnapshot.fromString(overlay);
		}

		if (!fs.existsSync(fileName)) return undefined;

		return typescript.ScriptSnapshot.fromString(
			fs.readFileSync(fileName, 'utf8'),
		);
	}

	getCurrentDirectory(): string {
		return this.currentDirectory;
	}

	getCompilationSettings(): typescript.CompilerOptions {
		return this.options;
	}

	getDefaultLibFileName(options: typescript.CompilerOptions): string {
		return typescript.getDefaultLibFilePath(options);
	}

	readFile(fileName: string, encoding?: string): string | undefined {
		return (
			this.overlays.get(fileName) ?? typescript.sys.readFile(fileName, encoding)
		);
	}

	fileExists(fileName: string): boolean {
		return this.overlays.has(fileName) || typescript.sys.fileExists(fileName);
	}

	readDirectory = typescript.sys.readDirectory;
	directoryExists = typescript.sys.directoryExists;
	getDirectories = typescript.sys.getDirectories;
	realpath = typescript.sys.realpath;
}

/**
 * Locates and parses the tsconfig driving the program.
 *
 * @param root Directory the search starts from.
 * @param explicit Path given in the options, when there is one.
 * @returns The parsed tsconfig.
 * @throws {Error} When no tsconfig can be found or it cannot be read.
 */
export const parseTsconfig = (
	root: string,
	explicit: string | undefined,
): typescript.ParsedCommandLine => {
	const configPath: string | undefined =
		explicit !== undefined
			? path.resolve(root, explicit)
			: typescript.findConfigFile(root, typescript.sys.fileExists);

	if (configPath === undefined) {
		throw new Error(
			`No tsconfig.json found from ${root}. The transformer needs one to ` +
				'know which files belong to the program.',
		);
	}

	const read = typescript.readConfigFile(configPath, typescript.sys.readFile);

	if (read.error !== undefined) {
		throw new Error(
			typescript.flattenDiagnosticMessageText(read.error.messageText, '\n'),
		);
	}

	return typescript.parseJsonConfigFileContent(
		read.config,
		typescript.sys,
		path.dirname(configPath),
	);
};

/** Options accepted by the transformer core. */
export interface TransformCoreOptions extends TransformerOptions {
	/** Path of the tsconfig driving the program. Defaults to the nearest one. */
	readonly tsconfig?: string;

	/** Directory the tsconfig search and the program resolve against. */
	readonly root?: string;
}

/** Transforms one file, or declines it. */
export interface FileTransformer {
	/**
	 * Tells whether a file is one this transformer is responsible for.
	 *
	 * Decided from the path alone, because the bundlers that filter before
	 * reading a file have nothing else to offer at that point. Whether the file
	 * actually calls anything is settled later, inside
	 * {@link FileTransformer.transform}.
	 *
	 * @param id Identifier of the file, as the bundler spells it.
	 * @returns `true` when the file is a TypeScript source of the project.
	 */
	readonly handles: (id: string) => boolean;

	/**
	 * Applies the transformer to one file.
	 *
	 * @param id Identifier of the file, as the bundler spells it.
	 * @param code Current content of the file.
	 * @returns The rewritten TypeScript, or `null` when nothing was done and the
	 * bundler should keep the original.
	 */
	readonly transform: (id: string, code: string) => string | null;
}

/**
 * Creates the transformer core.
 *
 * The program is built on the first file that actually needs it, so a project
 * never calling the utilities pays nothing.
 *
 * @param rewriters Rewriters of the package this core is serving.
 * @param options Options of the core.
 * @returns A transformer usable by any bundler adapter.
 */
export const createFileTransformer = (
	rewriters: readonly CallRewriter[],
	options: TransformCoreOptions = {},
): FileTransformer => {
	const root: string = options.root ?? process.cwd();
	const utilityPattern: RegExp = buildUtilityPattern(rewriters);
	const transformer = createTransformer(rewriters);

	let host: ProgramHost | undefined;
	let service: typescript.LanguageService | undefined;

	const handles = (id: string): boolean => {
		const fileName: string = id.split('?')[0];

		if (!HANDLED_EXTENSIONS.includes(path.extname(fileName))) return false;

		return !fileName.includes('node_modules');
	};

	const transform = (id: string, code: string): string | null => {
		if (!handles(id)) return null;

		// Cheap rejection before anything expensive: most files of a project
		// mention none of the utilities, and building the program for them
		// would cost seconds for nothing.
		if (!utilityPattern.test(code)) return null;

		const fileName: string = toCompilerPath(id.split('?')[0]);

		if (host === undefined || service === undefined) {
			host = new ProgramHost(parseTsconfig(root, options.tsconfig), root);
			service = typescript.createLanguageService(
				host,
				typescript.createDocumentRegistry(),
			);
		}

		host.update(fileName, code);

		const program: typescript.Program | undefined = service.getProgram();
		const sourceFile: typescript.SourceFile | undefined =
			program?.getSourceFile(fileName);

		if (program === undefined || sourceFile === undefined) return null;

		const result = typescript.transform(
			sourceFile,
			[transformer(program, { projectRoot: options.projectRoot ?? root })],
			program.getCompilerOptions(),
		);

		const [transformed] = result.transformed;

		const printed: string = typescript
			.createPrinter({ newLine: typescript.NewLineKind.LineFeed })
			.printFile(transformed);

		result.dispose();

		// Still TypeScript, only with the calls resolved: the bundler goes on to
		// erase the types as it would have anyway.
		return printed;
	};

	return { handles, transform };
};
