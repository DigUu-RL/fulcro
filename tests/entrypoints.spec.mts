import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Entry point suite.
 *
 * Every other suite of this repository reaches into a package through its
 * internal `@/*` alias, which proves the code works but says nothing about the
 * package around it. A wrong `main`, a typo in `exports`, a `files` list that
 * forgets a folder — none of that would turn a single one of them red, and all
 * of it would break the first consumer to run `npm install`.
 *
 * So this suite deliberately does the one thing the others do not: it resolves
 * the packages by name, through `node_modules`, against their built output —
 * exactly as a consumer does. Nothing here imports a source file.
 *
 * It also guards the public surface in the other direction, by asserting that
 * the internals stay unexported. That half is not pedantry: anything reachable
 * from an entry point is something a consumer can depend on, and therefore
 * something that cannot be changed later without breaking them.
 */

/** Resolves package entry points the way a consumer's runtime would. */
const resolve = createRequire(import.meta.url).resolve;

/** Packages published from this repository. */
const PACKAGE_NAMES = [
	'@fulcro/collections',
	'@fulcro/functions',
	'@fulcro/parallel',
	'@fulcro/reflect',
	'@fulcro/transformer',
] as const;

/** Manifest fields this suite reads back. */
interface Manifest {
	readonly name: string;
	readonly main?: string;
	readonly types?: string;
	readonly license?: string;
	readonly exports?: Record<string, unknown>;
	readonly publishConfig?: { readonly access?: string };
}

/**
 * Reads the manifest of a package, resolved by name.
 *
 * @param name Name of the package.
 * @returns The manifest and the directory holding it.
 */
const manifestOf = (name: string): { manifest: Manifest; root: string } => {
	const manifestPath: string = resolve(`${name}/package.json`);

	return {
		manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest,
		root: path.dirname(manifestPath),
	};
};

/** One package, as `npm pack --dry-run --json` reports it. */
interface PackReport {
	readonly name: string;
	readonly files: readonly { readonly path: string }[];
}

/** Root of the workspace, which this file sits one level below. */
const WORKSPACE_ROOT = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
);

/** Tarball contents per package name, filled once before the suite runs. */
const packed = new Map<string, readonly string[]>();

/**
 * Asks npm what every package would publish.
 *
 * Deliberately asked of npm rather than checked against the working tree.
 * `files`, `.npmignore` and the entries npm always adds or always drops decide
 * the tarball between them, and the result is regularly not what the directory
 * looks like: a `files` list that forgets `dist` leaves every built file sitting
 * right there on disk while the published package contains none of them.
 *
 * One invocation covers the whole workspace. It used to be one per package,
 * inside the tests that needed it, and that spent four npm startups where one
 * would do — enough, on a cold Windows runner, for the first of them to pass the
 * default five second timeout on its own.
 */
const readPackedFiles = (): void => {
	const output: string = execSync('npm pack --dry-run --json --workspaces', {
		cwd: WORKSPACE_ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

	for (const report of JSON.parse(output) as readonly PackReport[]) {
		packed.set(
			report.name,
			report.files.map((file) => file.path),
		);
	}
};

/**
 * Paths the tarball of a package would contain.
 *
 * @param name Name of the package.
 * @returns The paths, as npm spells them.
 */
const packedFiles = (name: string): readonly string[] => {
	const files: readonly string[] | undefined = packed.get(name);

	if (files === undefined) {
		throw new Error(
			`npm pack reported nothing for ${name}. Is it still a workspace?`,
		);
	}

	return files;
};

// Generous, because it spawns npm over the whole workspace and a cold runner
// takes its time. It runs once for the file, so the cost is paid once.
beforeAll(readPackedFiles, 120_000);

/**
 * Rewrites a manifest path the way npm spells it inside a tarball.
 *
 * @param declared Path as written in the manifest, such as `./dist/index.js`.
 * @returns The same path without its leading `./`, with forward slashes.
 */
const asPackedPath = (declared: string): string =>
	declared.replace(/^\.\//, '').split(path.sep).join('/');

/**
 * Collects every relative path an exports map points at.
 *
 * The map nests conditions freely — `types`, `default`, and whatever else gets
 * added later — so the values are gathered by walking it rather than by
 * assuming a shape.
 *
 * @param node Fragment of the exports map being walked.
 * @returns Every relative path found underneath it.
 */
const exportedPaths = (node: unknown): string[] => {
	if (typeof node === 'string') return node.startsWith('./') ? [node] : [];

	if (typeof node !== 'object' || node === null) return [];

	return Object.values(node as Record<string, unknown>).flatMap(exportedPaths);
};

describe.each(PACKAGE_NAMES)('%s, as a consumer sees it', (name) => {
	const { manifest } = manifestOf(name);

	it('should resolve by name to the manifest it declares', () => {
		expect(manifest.name).toBe(name);
	});

	it('should publish every file its exports map points at', () => {
		const paths: string[] = exportedPaths(manifest.exports);

		// A guard on the guard: an exports map that resolved to nothing would
		// make the assertion below pass without checking anything.
		expect(paths.length).toBeGreaterThan(0);

		const shipped: readonly string[] = packedFiles(name);

		for (const exported of paths) {
			expect(
				shipped,
				`${name} exports ${exported}, which its tarball does not contain`,
			).toContain(asPackedPath(exported));
		}
	});

	it('should publish the files main and types point at', () => {
		const shipped: readonly string[] = packedFiles(name);

		for (const field of [manifest.main, manifest.types]) {
			expect(field).toBeDefined();
			expect(
				shipped,
				`${name} declares ${field}, which its tarball does not contain`,
			).toContain(asPackedPath(field as string));
		}
	});

	it('should be publishable under its scope', () => {
		// A scoped package defaults to restricted, and `npm publish` then fails
		// on an account without a paid plan.
		expect(manifest.publishConfig?.access).toBe('public');
	});

	it('should carry the licence it declares', () => {
		expect(manifest.license).toBe('ISC');
		expect(packedFiles(name)).toContain('LICENSE');
	});
});

describe('@fulcro/collections', () => {
	it('should expose the one class a sequence is built from', async () => {
		const entry = await import('@fulcro/collections');

		expect(typeof entry.SequenceCollection.from).toBe('function');
		expect(typeof entry.SequenceCollection.empty).toBe('function');
	});

	it('should work end to end through the published entry point', async () => {
		const { SequenceCollection } = await import('@fulcro/collections');

		const result = SequenceCollection.from([3, 1, 2, 1])
			.distinct()
			.orderBy((value) => value)
			.select((value) => value * 10)
			.toArray();

		expect(result).toEqual([10, 20, 30]);
	});

	it('should run its composition root on import', async () => {
		const { SequenceCollection } = await import('@fulcro/collections');

		// `groupBy` and `orderBy` build their results through the factory
		// registry, so both throw unless the barrel wired the concrete classes
		// into it on load. This is what a bundler dropping the package as side
		// effect free would break.
		const groups = SequenceCollection.from(['aa', 'ab', 'bc'])
			.groupBy((word) => word[0])
			.toArray();

		expect(groups.map((group) => group.key)).toEqual(['a', 'b']);
		expect(groups[0].toArray()).toEqual(['aa', 'ab']);
	});

	it('should keep the concrete subclasses and the registry unexported', async () => {
		const entry = await import('@fulcro/collections');

		expect(entry).not.toHaveProperty('GroupCollection');
		expect(entry).not.toHaveProperty('OrderedSequenceCollection');

		// The factory registry is wiring, not API. It carries no runtime value
		// to assert on, so the declarations are what gets checked.
		const { root } = manifestOf('@fulcro/collections');
		const declarations: string = readFileSync(
			path.join(root, 'dist/index.d.ts'),
			'utf8',
		);

		expect(declarations).not.toContain('factories');
	});
});

describe('@fulcro/reflect', () => {
	it('should expose the type aware utilities and the constant they report', async () => {
		const entry = await import('@fulcro/reflect');

		expect(typeof entry.nameOf).toBe('function');
		expect(typeof entry.typeOf).toBe('function');
		expect(typeof entry.defaultOf).toBe('function');
		expect(entry.ANONYMOUS_NAME).toBe('(anonymous)');
	});

	it('should leave the runtime helpers to their own package', async () => {
		const entry = await import('@fulcro/reflect');

		// This package is for what the compiler erases. `switchFor` and
		// `tryCatch` need nothing from it, and live in `@fulcro/functions`.
		expect(entry).not.toHaveProperty('switchFor');
		expect(entry).not.toHaveProperty('tryCatch');
	});

	it('should answer at runtime, without the transformer', async () => {
		const { typeOf } = await import('@fulcro/reflect');

		// Nothing compiles this file through the transformer, which is the
		// point: this is the fallback behaviour a consumer gets before wiring
		// `@fulcro/transformer` up.
		expect(typeOf(null).typeId).toBe('null');
		expect(typeOf([1, 2]).typeId).toBe('array');
		expect(typeOf(Number.NaN).typeId).toBe('nan');
		expect(typeOf('text').declared).toBeNull();
	});

	it('should keep the internal helpers unexported', async () => {
		const entry = await import('@fulcro/reflect');

		expect(entry).not.toHaveProperty('resolveCallableId');
	});
});

describe('@fulcro/collections/async', () => {
	it('should resolve from its own subpath', async () => {
		const entry = await import('@fulcro/collections/async');

		expect(typeof entry.AsyncSequenceCollection.from).toBe('function');
		expect(typeof entry.AsyncSequenceCollection.empty).toBe('function');
	});

	it('should work end to end through the published subpath', async () => {
		const { AsyncSequenceCollection } =
			await import('@fulcro/collections/async');

		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.where(async (value) => value % 2 === 0)
			.select((value) => value * 10)
			.toArray();

		expect(result).toEqual([20, 40]);
	});

	it('should stay out of the main entry point', async () => {
		// The subpath exists so a bundle importing only the synchronous
		// sequence carries none of the asynchronous half.
		const main = await import('@fulcro/collections');

		expect(main).not.toHaveProperty('AsyncSequenceCollection');
	});
});

describe('@fulcro/functions', () => {
	it('should expose both helpers', async () => {
		const entry = await import('@fulcro/functions');

		expect(typeof entry.switchFor).toBe('function');
		expect(typeof entry.tryCatch).toBe('function');
	});

	it('should dispatch exhaustively through the published entry point', async () => {
		const { switchFor } = await import('@fulcro/functions');

		expect(
			switchFor('dark' as 'dark' | 'light', {
				dark: () => 'moon',
				light: () => 'sun',
			}),
		).toBe('moon');
	});

	it('should still take the predicate form', async () => {
		const { switchFor } = await import('@fulcro/functions');

		expect(
			switchFor(10, [{ when: (n) => n > 5, then: () => 'big' }], () => 'small'),
		).toBe('big');
	});

	it('should capture a synchronous throw', async () => {
		const { tryCatch } = await import('@fulcro/functions');

		const failed = await tryCatch(() => {
			throw new Error('boom');
		});

		expect((failed.error as Error).message).toBe('boom');
	});
});

describe('@fulcro/transformer', () => {
	it('should expose the compiler plugin as its default export', async () => {
		const entry = await import('@fulcro/transformer');

		// What `ts-patch` loads and calls with the program.
		expect(typeof entry.default).toBe('function');
	});

	it('should expose an adapter for every bundler it claims to serve', async () => {
		const adapters = await import('@fulcro/transformer/unplugin');

		for (const bundler of [
			'vite',
			'rollup',
			'webpack',
			'rspack',
			'esbuild',
			'farm',
		]) {
			expect(typeof adapters[bundler as keyof typeof adapters]).toBe(
				'function',
			);
		}
	});
});
