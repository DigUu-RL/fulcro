#!/usr/bin/env node
/**
 * Rewrites the `@/…` imports of a package's built output into relative paths.
 *
 * Every package imports its own modules through the `@/*` alias its tsconfig
 * declares, and `tsc` emits those specifiers untouched — a consumer's runtime
 * has never heard of the alias. This walks `outDir` after `tsc` and replaces
 * each one with the path a consumer's resolver can follow, the way `tsc-alias`
 * used to. It replaced `tsc-alias` because that tool pulls in `braces` through
 * `chokidar` and `globby`, which carries a denial-of-service advisory no
 * version fixes; this needs nothing beyond Node.
 *
 * Only the shape this repository uses is supported, and anything else is
 * refused rather than half-handled: one alias, `@/*`, mapped to `rootDir`.
 *
 * Resolution follows what a consumer's runtime needs. A specifier that already
 * names a file (`@/pool/index.js`, as the ESM package writes them) keeps it; a
 * bare one becomes `<path>.js` when that file was emitted, and
 * `<path>/index.js` when a directory was. One that resolves to neither is an
 * error, since leaving it would ship an import nothing can load.
 *
 * Usage, from a package directory: `node ../../tools/build/rewrite-aliases.mjs`.
 */
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The compiler's own reader for a tsconfig: comments, trailing commas and
 * `extends` are TypeScript's syntax, not JSON's, and `parallel` uses the first.
 */
const ts = createRequire(import.meta.url)('typescript');

/** The alias every package declares, and nothing else. */
const ALIAS = '@/*';

/** Built files whose import specifiers a consumer's tooling reads. */
const BUILT_FILE = /\.(?:js|mjs|cjs|d\.ts|d\.mts|d\.cts)$/;

/**
 * Where an `@/…` specifier sits: after `from`, inside `require(` or `import(`,
 * or as a bare `import '…'`. Comments mentioning a path in backticks are not
 * matched, so the prose in a doc comment survives as written.
 */
const SPECIFIER =
	/(\bfrom\s*|\brequire\(\s*|\bimport\(\s*|\bimport\s+)(['"])@\/([^'"]+)\2/g;

/** Extensions a specifier may already carry, which are kept as they are. */
const EXPLICIT_EXTENSION = /\.(?:js|mjs|cjs)$/;

/**
 * Reads where the package compiles to, and checks its alias is the one shape
 * this script supports.
 *
 * @param packageDirectory Directory holding the package's `tsconfig.json`.
 * @returns The absolute `outDir`.
 * @throws {Error} When the tsconfig declares another alias, or none.
 */
export const outDirOf = (packageDirectory) => {
	const configFile = path.join(packageDirectory, 'tsconfig.json');
	const { config, error } = ts.readConfigFile(configFile, ts.sys.readFile);

	if (error !== undefined) {
		throw new Error(
			`rewrite-aliases: ${configFile}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
		);
	}

	const { options } = ts.parseJsonConfigFileContent(
		config,
		ts.sys,
		packageDirectory,
		undefined,
		configFile,
	);
	const { outDir, rootDir, paths = {} } = options;
	const aliases = Object.keys(paths);
	const pathsBase = options.pathsBasePath ?? packageDirectory;

	if (
		outDir === undefined ||
		rootDir === undefined ||
		aliases.length !== 1 ||
		aliases[0] !== ALIAS ||
		paths[ALIAS].length !== 1 ||
		path.resolve(pathsBase, paths[ALIAS][0]) !== path.join(rootDir, '*')
	) {
		throw new Error(
			`rewrite-aliases: ${configFile} must declare outDir, rootDir and exactly one alias, "${ALIAS}": ["<rootDir>/*"].`,
		);
	}

	return path.resolve(outDir);
};

/**
 * Lists every built file under a directory.
 *
 * @param directory Directory to walk.
 * @returns Absolute paths, in a stable order.
 */
const builtFiles = (directory) =>
	readdirSync(directory)
		.sort()
		.flatMap((entry) => {
			const full = path.join(directory, entry);

			if (statSync(full).isDirectory()) return builtFiles(full);

			return BUILT_FILE.test(entry) ? [full] : [];
		});

/**
 * Turns one aliased specifier into the relative one a consumer can load.
 *
 * @param outDir Absolute output directory the alias points into.
 * @param file Absolute path of the file the specifier is in.
 * @param target What follows `@/` in the specifier.
 * @returns The relative specifier, always starting with `./` or `../`.
 * @throws {Error} When the target was not emitted, as a file or a directory.
 */
export const relativeSpecifier = (outDir, file, target) => {
	const absolute = path.join(outDir, target);
	const resolved = EXPLICIT_EXTENSION.test(target)
		? absolute
		: existsSync(`${absolute}.js`)
			? `${absolute}.js`
			: existsSync(path.join(absolute, 'index.js'))
				? path.join(absolute, 'index.js')
				: undefined;

	if (resolved === undefined || !existsSync(resolved)) {
		throw new Error(
			`rewrite-aliases: '@/${target}' in ${file} resolves to nothing under ${outDir}.`,
		);
	}

	const relative = path
		.relative(path.dirname(file), resolved)
		.split(path.sep)
		.join('/');

	return relative.startsWith('.') ? relative : `./${relative}`;
};

/**
 * Rewrites the aliased specifiers of one file's text.
 *
 * @param outDir Absolute output directory.
 * @param file Absolute path of the file.
 * @param text Its contents.
 * @returns The contents with every `@/…` specifier made relative.
 */
export const rewriteText = (outDir, file, text) =>
	text.replace(
		SPECIFIER,
		(_match, lead, quote, target) =>
			`${lead}${quote}${relativeSpecifier(outDir, file, target)}${quote}`,
	);

/**
 * Rewrites every built file of a package in place.
 *
 * @param packageDirectory Directory holding the package's `tsconfig.json`.
 * @returns How many files changed.
 */
export const rewriteAliases = (packageDirectory) => {
	const outDir = outDirOf(packageDirectory);
	let changed = 0;

	for (const file of builtFiles(outDir)) {
		const text = readFileSync(file, 'utf8');
		const rewritten = rewriteText(outDir, file, text);

		if (rewritten !== text) {
			writeFileSync(file, rewritten);
			changed++;
		}
	}

	return changed;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	rewriteAliases(process.cwd());
}
