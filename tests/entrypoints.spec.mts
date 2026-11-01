import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Types only, erased before the suite runs: each package is still loaded by the
// `import()` of the test that needs it, against its built output.
import type { EqualityRule } from '@fulcro/functions';
import type { Decimal as DecimalValue } from '@fulcro/types';
import typescript from 'typescript';
import { assert, beforeAll, describe, expect, it } from 'vitest';

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
	'@fulcro/errors',
	'@fulcro/functions',
	'@fulcro/memory',
	'@fulcro/parallel',
	'@fulcro/reflect',
	'@fulcro/transform-core',
	'@fulcro/types',
] as const;

/** Manifest fields this suite reads back. */
interface Manifest {
	readonly name: string;
	readonly main?: string;
	readonly types?: string;
	readonly license?: string;
	readonly exports?: Record<string, unknown>;
	readonly peerDependencies?: Record<string, string>;
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

/**
 * Tells whether a value npm reported is a list, keeping its elements unknown:
 * `Array.isArray` alone narrows to `any[]`.
 *
 * @param value The value.
 * @returns `true` for an array.
 */
const isList = (value: unknown): value is readonly unknown[] => Array.isArray(value);

/** Root of the workspace, which this file sits one level below. */
const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

	// npm has changed this shape across major versions: 11 answers with an array
	// of reports, 12 with an object keyed by package name. Both are accepted
	// rather than one being assumed, because assuming is how a release broke —
	// the release workflow upgrades npm, so it met the new shape first and this
	// died on `JSON.parse(...)` not being iterable.
	const parsed: unknown = JSON.parse(output);

	// Read as what an unknown shape would hand over: anything, or nothing.
	const reports: readonly (Partial<PackReport> | null)[] = Array.isArray(parsed)
		? (parsed as readonly (Partial<PackReport> | null)[])
		: Object.values(parsed as Record<string, Partial<PackReport> | null>);

	for (const report of reports) {
		// A third shape would otherwise populate nothing and leave every
		// assertion below passing over an empty map.
		if (typeof report?.name !== 'string' || !isList(report.files)) {
			throw new Error(
				`npm pack answered in a shape this suite does not recognise, which has happened before. The output began: ${output.slice(0, 200)}`,
			);
		}

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
		throw new Error(`npm pack reported nothing for ${name}. Is it still a workspace?`);
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
const asPackedPath = (declared: string): string => {
	return declared.replace(/^\.\//, '').split(path.sep).join('/');
};

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

describe('the declarations, as a Node project without the DOM compiles them', () => {
	it('should compile every entry point with the library declarations checked', () => {
		// `@fulcro/parallel` once named the browser's `Transferable` in a
		// published type, and a project like this one got TS2304 from inside the
		// package. Only `@fulcro/parallel` compiles against the DOM, so only a
		// consumer without it notices a type borrowed from there.
		const sample: string = path.join(WORKSPACE_ROOT, 'tests', 'declarations.sample.ts');

		const program: typescript.Program = typescript.createProgram([sample], {
			target: typescript.ScriptTarget.ES2022,
			module: typescript.ModuleKind.NodeNext,
			moduleResolution: typescript.ModuleResolutionKind.NodeNext,
			lib: ['lib.es2024.d.ts'],
			types: ['node'],
			strict: true,
			skipLibCheck: false,
			noEmit: true,
		});

		const ours = (fileName: string): boolean => {
			return /[\\/]packages[\\/][^\\/]+[\\/]dist[\\/]|declarations\.sample\.ts$/.test(fileName);
		};

		// Ours only: `unplugin`'s declarations import the types of every bundler
		// it adapts, and this project installs none of them.
		const found: string[] = typescript.getPreEmitDiagnostics(program).flatMap((diagnostic) => {
			return diagnostic.file !== undefined && ours(diagnostic.file.fileName)
				? [
						`${path.relative(WORKSPACE_ROOT, diagnostic.file.fileName)}: TS${String(diagnostic.code)} ${typescript.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
					]
				: [];
		});

		expect(found).toEqual([]);

		// A guard on the guard: a sample that resolved none of the packages would
		// report nothing from them.
		expect(
			program
				.getSourceFiles()
				.filter((file) => /[\\/]packages[\\/]parallel[\\/]dist[\\/]/.test(file.fileName)),
		).not.toEqual([]);
	}, 120_000);

	it('should declare TypeScript 5.4 as a floor wherever a declaration names NoInfer', () => {
		// `NoInfer` arrived in 5.4, and this suite compiles on one newer compiler
		// only, so it never sees what an older one makes of it: TS2304 from inside
		// the package, for importing anything at all. `@fulcro/functions` shipped
		// it with no floor declared once. A peer at least that high turns the same
		// failure into a warning at install, naming the cause.
		const unmet: string[] = PACKAGE_NAMES.flatMap((name) => {
			const { manifest, root } = manifestOf(name);
			const declarations: string = path.join(root, 'dist');

			const names: boolean = readdirSync(declarations, { recursive: true })
				.map(String)
				.filter((file) => file.endsWith('.d.ts'))
				.some((file) => /\bNoInfer</.test(readFileSync(path.join(declarations, file), 'utf8')));

			const floor: RegExpExecArray | null = />=\s*(\d+)\.(\d+)/.exec(
				manifest.peerDependencies?.typescript ?? '',
			);

			const admitsOlder: boolean =
				floor === null || Number(floor[1]) < 5 || (Number(floor[1]) === 5 && Number(floor[2]) < 4);

			return names && admitsOlder
				? [`${name}: typescript peer ${manifest.peerDependencies?.typescript ?? 'missing'}`]
				: [];
		});

		expect(unmet).toEqual([]);
	});
});

describe('the declarations a consumer emits', () => {
	it('should let a project with declarations on re-export every descriptor under its inferred type', () => {
		// `@fulcro/types` 2.1.0 was built declaring the float descriptors with a
		// type its barrel did not export, and `export const Half =
		// HalfPrecisionFloat` stopped compiling for every consumer that emits
		// declarations: TS2742, no portable way to name the type. The suite above
		// compiles with `noEmit`, and inside this workspace the compiler can always
		// name a file by its path under `packages/`, so neither could see it. A
		// consumer has the packages copied under its own `node_modules` and no
		// other path to them, which is what is built here.
		const consumer: string = mkdtempSync(path.join(tmpdir(), 'fulcro-consumer-'));

		try {
			for (const name of PACKAGE_NAMES) {
				const { root } = manifestOf(name);
				const target: string = path.join(consumer, 'node_modules', ...name.split('/'));

				cpSync(path.join(root, 'package.json'), path.join(target, 'package.json'));
				cpSync(path.join(root, 'dist'), path.join(target, 'dist'), { recursive: true });
			}

			// An ES module, as every consumer of packages that ship only ES modules
			// is. A CommonJS file names the same types through `import()`, which
			// reaches them anywhere and hides the failure.
			writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ type: 'module' }));

			const sample: string = path.join(consumer, 'index.ts');

			cpSync(path.join(WORKSPACE_ROOT, 'tests', 'declarationEmit.sample.ts'), sample);

			const program: typescript.Program = typescript.createProgram([sample], {
				target: typescript.ScriptTarget.ES2022,
				module: typescript.ModuleKind.NodeNext,
				moduleResolution: typescript.ModuleResolutionKind.NodeNext,
				lib: ['lib.es2024.d.ts'],
				types: [],
				strict: true,
				declaration: true,
				emitDeclarationOnly: true,
				// The library declarations are the other suite's subject; this one is
				// what naming their types costs the consumer's own.
				skipLibCheck: true,
			});

			const emitted = program.emit(undefined, () => undefined);

			const found: string[] = [
				...typescript.getPreEmitDiagnostics(program),
				...emitted.diagnostics,
			].flatMap((diagnostic) => {
				return diagnostic.file?.fileName === program.getSourceFile(sample)?.fileName
					? [
							`TS${String(diagnostic.code)} ${typescript.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
						]
					: [];
			});

			expect(found).toEqual([]);

			// A guard on the guard: a sample resolving the workspace rather than the
			// copies would pass whatever the declarations said.
			expect(
				program.getSourceFiles().some((file) => {
					return file.fileName.includes('/node_modules/@fulcro/types/dist/');
				}),
			).toBe(true);
		} finally {
			rmSync(consumer, { recursive: true, force: true });
		}
	}, 120_000);
});

describe('the repository as someone else clones it', () => {
	it('should not be ignoring a file the sources need', () => {
		// A `.gitignore` rule written to block build output beside sources once
		// swallowed a test fixture that happened to share its extension. It
		// existed on every machine that had run the build, so everything passed
		// locally — and thirteen tests failed on the first clean checkout, which
		// is the only place a file missing from the repository can be noticed.
		//
		// This asks git directly: what is on disk under a package's sources, and
		// not in the repository? The answer has to be nothing.
		const everything: string = execSync('git ls-files --others --ignored --exclude-standard', {
			cwd: WORKSPACE_ROOT,
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
		});

		// Filtered here rather than through a pathspec: `packages/*/src` does not
		// match as a git pathspec, and passing one that silently matches nothing
		// is how this assertion would pass while checking nothing at all.
		const missing: string[] = everything
			.split(/\r?\n/)
			.filter((line) => /^packages\/[^/]+\/src\//.test(line));

		expect(
			missing,
			`these files exist locally but are not in the repository:\n${missing.join('\n')}`,
		).toEqual([]);
	});
});

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
			expect(shipped, `${name} exports ${exported}, which its tarball does not contain`).toContain(
				asPackedPath(exported),
			);
		}
	});

	it('should publish the files main and types point at', () => {
		const shipped: readonly string[] = packedFiles(name);

		for (const field of [manifest.main, manifest.types]) {
			assert.isDefined(field, `${name} declares no main or types`);

			expect(shipped, `${name} declares ${field}, which its tarball does not contain`).toContain(
				asPackedPath(field),
			);
		}
	});

	it('should publish the declaration maps its declarations name, and the sources they point at', () => {
		// A declaration naming a map the tarball lacks is a missing file for every
		// tool that reads declaration maps, and a map whose source is absent sends
		// a consumer's Go to Definition back to the `.d.ts`. The build once named
		// 95 maps it never emitted, and nothing else here would have noticed.
		const { root } = manifestOf(name);
		const shipped: readonly string[] = packedFiles(name);
		const declarations: readonly string[] = shipped.filter((file) => file.endsWith('.d.ts'));
		let maps = 0;

		for (const declaration of declarations) {
			const text: string = readFileSync(path.join(root, declaration), 'utf8');
			const named: string | undefined = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(text)?.[1];

			if (named === undefined) continue;

			const map: string = path.posix.join(path.posix.dirname(declaration), named);

			expect(
				shipped,
				`${declaration} names ${named}, which the tarball does not contain`,
			).toContain(map);

			const { sources } = JSON.parse(readFileSync(path.join(root, map), 'utf8')) as {
				readonly sources: readonly string[];
			};

			for (const source of sources) {
				expect(shipped, `${map} points at ${source}, which the tarball does not contain`).toContain(
					path.posix.join(path.posix.dirname(map), source),
				);
			}

			maps += 1;
		}

		// A guard on the guard: a pattern that matched no declaration would make
		// every assertion above pass without checking anything.
		expect(maps).toBeGreaterThan(0);
	});

	it('should use no top-level await, which require refuses', () => {
		// A compiler plugin loader that calls `require` reaches these packages
		// through Node's `require` of an ES module, and that refuses a module
		// graph with a top-level await. The build emits top-level statements
		// unindented, so one would start a line.
		const { root } = manifestOf(name);
		const modules: readonly string[] = packedFiles(name).filter((file) => file.endsWith('.js'));

		expect(modules.length).toBeGreaterThan(0);

		for (const file of modules) {
			expect(readFileSync(path.join(root, file), 'utf8'), `${name} ${file}`).not.toMatch(
				/^(?:await\b|for await\b|(?:const|let|var)\s[^=]*=\s*await\b)/m,
			);
		}
	});

	it('should publish its sources without its suites', () => {
		const shipped: readonly string[] = packedFiles(name);

		expect(shipped.filter((file) => file.startsWith('src/tests/'))).toEqual([]);
		expect(shipped.filter((file) => /\.(spec|sample|fixture)\.ts$/.test(file))).toEqual([]);
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
		expect(groups[0]?.toArray()).toEqual(['aa', 'ab']);
	});

	it('should keep the concrete subclasses and the registry unexported', async () => {
		const entry = await import('@fulcro/collections');

		expect(entry).not.toHaveProperty('GroupCollection');
		expect(entry).not.toHaveProperty('OrderedSequenceCollection');

		// The factory registry is wiring, not API. It carries no runtime value
		// to assert on, so the declarations are what gets checked.
		const { root } = manifestOf('@fulcro/collections');
		const declarations: string = readFileSync(path.join(root, 'dist/index.d.ts'), 'utf8');

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
		// the transformer up.
		expect(typeOf(null).typeId).toBe('null');
		expect(typeOf([1, 2]).typeId).toBe('array');
		expect(typeOf(Number.NaN).typeId).toBe('nan');
		expect(typeOf('text').declared).toBeNull();
	});

	it('should keep the internal helpers unexported', async () => {
		const entry = await import('@fulcro/reflect');

		expect(entry).not.toHaveProperty('resolveCallableId');
		expect(entry).not.toHaveProperty('unresolvedLayout');
		expect(entry).not.toHaveProperty('describeUnwritable');
	});

	it('should compute a constant at runtime, without the transformer', async () => {
		const { constantOf } = await import('@fulcro/reflect');

		// The one layout-free answer that needs no transformer: the function
		// runs here, and the value is what the compile-time literal would be.
		const table = constantOf(() => [1, 2, 3].map((value) => value * value));

		expect(table).toEqual([1, 4, 9]);
		expect(Object.isFrozen(table)).toBe(true);

		expect(() => constantOf(() => new Map() as never)).toThrow(
			expect.objectContaining({ code: 'FULCRO4011' }),
		);
	});

	it('should refuse to guess a layout without the transformer', async () => {
		const { alignOf, layoutOf, offsetOf, sizeOf } = await import('@fulcro/reflect');

		// A layout is declared on a type and never on a value, so there is
		// nothing at runtime to read it from.
		expect(() => sizeOf()).toThrow('only exists at compile time');
		expect(() => alignOf()).toThrow('only exists at compile time');
		expect(() => layoutOf()).toThrow('only exists at compile time');

		expect(() => offsetOf('x')).toThrow(expect.objectContaining({ code: 'FULCRO4009' }));
		expect(() => offsetOf('x')).toThrow('offsetOf<T>("x")');
	});
});

describe('@fulcro/types', () => {
	it('should expose one value per numeric and mathematics type, and struct', async () => {
		const entry = await import('@fulcro/types');

		// An ES module's namespace holds exactly what it exports, so the list
		// is compared whole.
		expect(Object.keys(entry).sort()).toEqual([
			'BigInteger',
			'ComplexNumber',
			'Decimal',
			'DoublePrecisionFloat',
			'Fraction',
			'HalfPrecisionFloat',
			'Matrix',
			'Quaternion',
			'SignedInteger',
			'SinglePrecisionFloat',
			'UnsignedInteger',
			'Vector',
			'struct',
		]);
	});

	it('should store every numeric type with a fixed layout as bytes, through the published entry point', async () => {
		const {
			Decimal,
			DoublePrecisionFloat,
			HalfPrecisionFloat,
			SignedInteger,
			SinglePrecisionFloat,
			UnsignedInteger,
		} = await import('@fulcro/types');

		const view = new DataView(new ArrayBuffer(16));
		const bytes = new Uint8Array(view.buffer);

		expect(
			[
				SignedInteger(8),
				UnsignedInteger(128),
				HalfPrecisionFloat,
				SinglePrecisionFloat,
				DoublePrecisionFloat,
				Decimal,
			].map((type) => [type.layout.size, type.layout.alignment]),
		).toEqual([
			[1, 1],
			[16, 16],
			[2, 2],
			[4, 4],
			[8, 8],
			[16, 16],
		]);

		SignedInteger(32).write(view, 0, SignedInteger(32).from(-2));

		expect([...bytes.subarray(0, 4)]).toEqual([0xfe, 0xff, 0xff, 0xff]);
		expect(SignedInteger(32).read(view, 0)).toBe(-2);

		UnsignedInteger(128).write(view, 0, UnsignedInteger(128).maximum);

		expect(UnsignedInteger(128).read(view, 0)).toBe(2n ** 128n - 1n);

		HalfPrecisionFloat.write(view, 0, HalfPrecisionFloat.from(1));

		expect([...bytes.subarray(0, 2)]).toEqual([0x00, 0x3c]);

		Decimal.write(view, 0, Decimal.from('19.99'));

		expect(Decimal.read(view, 0).toString()).toBe('19.99');

		expect(() => SinglePrecisionFloat.read(view, 14)).toThrow(
			expect.objectContaining({
				code: 'FULCRO6018',
				details: { operation: 'SinglePrecisionFloat.read', size: 4, offset: 14, available: 16 },
			}),
		);
	});

	it('should compute with the mathematics types through the published entry point', async () => {
		const {
			ComplexNumber,
			DoublePrecisionFloat,
			Fraction,
			Matrix,
			Quaternion,
			SignedInteger,
			Vector,
		} = await import('@fulcro/types');

		const Transform = Matrix(DoublePrecisionFloat, 2, 3);
		const Point = Vector(DoublePrecisionFloat, 3, 1);

		const moved = Transform.multiply(
			Transform.from([
				[1, 0, 5],
				[0, 1, 7],
			]),
			Point.from([2, 3, 1]),
		);

		expect([...moved]).toEqual([7, 10]);

		const Complex = ComplexNumber(DoublePrecisionFloat);
		const item = Complex.from({ real: 0, imaginary: 1 });

		expect(Complex.multiply(item, item)).toEqual({ real: -1, imaginary: 0 });

		const Rotation = Quaternion(DoublePrecisionFloat);

		expect(
			Rotation.multiply(
				Rotation.from({ w: 0, x: 1, y: 0, z: 0 }),
				Rotation.from({ w: 0, x: 0, y: 1, z: 0 }),
			),
		).toEqual({ w: 0, x: 0, y: 0, z: 1 });

		const Ratio = Fraction(SignedInteger(32));

		expect(Ratio.from({ numerator: 6, denominator: -4 })).toEqual({
			numerator: -3,
			denominator: 2,
		});
	});

	it('should give the values of a struct its methods through the published entry point', async () => {
		const { SinglePrecisionFloat, struct } = await import('@fulcro/types');

		const Point = struct(
			'Point',
			{ x: SinglePrecisionFloat, y: SinglePrecisionFloat },
			{
				length() {
					return Math.hypot(this.x, this.y);
				},
			},
		);

		const view = new DataView(new ArrayBuffer(Point.layout.size));

		Point.write(view, 0, Point.from({ x: 3, y: 4 }));

		expect(Point.read(view, 0).length()).toBe(5);
		expect(Point.is(Object.freeze({ x: 3, y: 4 }))).toBe(false);
	});

	it('should declare, store and read back a struct through the published entry point', async () => {
		const { SinglePrecisionFloat, UnsignedInteger, struct } = await import('@fulcro/types');

		const Particle = struct('Particle', {
			mass: SinglePrecisionFloat,
			charge: UnsignedInteger(8),
		});

		const view = new DataView(new ArrayBuffer(Particle.layout.size));
		const value = Particle.from({ mass: 0.5, charge: 3 });

		Particle.write(view, 0, value);

		expect(Particle.layout).toEqual({
			size: 8,
			alignment: 4,
			fields: {
				mass: { offset: 0, size: 4, alignment: 4 },
				charge: { offset: 4, size: 1, alignment: 1 },
			},
		});

		expect(Particle.equals(Particle.read(view, 0), value)).toBe(true);
	});

	it('should work end to end through the published entry point', async () => {
		const { Decimal, HalfPrecisionFloat, SignedInteger } = await import('@fulcro/types');

		const Int32 = SignedInteger(32);

		expect(Int32.add(Int32.from(2), Int32.from(3))).toBe(5);
		expect(() => Int32.add(Int32.maximum, Int32.from(1))).toThrow(RangeError);
		expect(HalfPrecisionFloat.from(0.1)).toBe(0.0999755859375);
		expect(Decimal.from('0.1').add(Decimal.from('0.2')).toString()).toBe('0.3');
	});

	it('should keep the machinery unexported', async () => {
		const entry = await import('@fulcro/types');

		for (const internal of [
			'createIntegerType',
			'createFloatType',
			'parseDecimal',
			'requireRoundingMode',
			'codecOf',
			'registerCodec',
			'registerRepeatedCodec',
			'elementOf',
			'createMatrixOperations',
			'createComponentRecord',
			'createHypercomplexType',
			'MatrixOperations',
		]) {
			expect(entry).not.toHaveProperty(internal);
		}
	});

	it('should publish no compiler plugin', () => {
		// The operators were once rewritten by a plugin behind these entry
		// points. Nothing is configured now, and nothing is published for it.
		const require = createRequire(import.meta.url);

		for (const entry of [
			'@fulcro/types/transformer',
			'@fulcro/types/unplugin',
			'@fulcro/types/language-service',
		]) {
			expect(() => {
				require(entry);
			}).toThrow(expect.objectContaining({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }));
		}
	});

	it('should leave the operators to the language', async () => {
		const { Decimal, SignedInteger } = await import('@fulcro/types');
		const Int32 = SignedInteger(32);

		// The operators are the language's own, unchecked on a number and
		// refused on a decimal: the methods are what keep the type.
		expect((Int32.maximum as number) + 1).toBe(2147483648);
		expect(() => (Decimal.from(1) as unknown as number) + 1).toThrow(TypeError);
	});

	it('should carry no runtime trace of a layout', async () => {
		const { Decimal } = await import('@fulcro/types');

		// Declared for the type checker only: a value never has the property.
		expect('~layout' in Decimal.from('1')).toBe(false);
	});
});

describe('@fulcro/collections/async', () => {
	it('should resolve from its own subpath', async () => {
		const entry = await import('@fulcro/collections/async');

		expect(typeof entry.AsyncSequenceCollection.from).toBe('function');
		expect(typeof entry.AsyncSequenceCollection.empty).toBe('function');
	});

	it('should work end to end through the published subpath', async () => {
		const { AsyncSequenceCollection } = await import('@fulcro/collections/async');

		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.where((value) => Promise.resolve(value % 2 === 0))
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

describe('@fulcro/errors', () => {
	it('should expose its functions and FulcroError, and nothing of the catalog', async () => {
		const entry = await import('@fulcro/errors');

		// An ES module's namespace holds exactly what it exports.
		expect(Object.keys(entry).sort()).toEqual([
			'FulcroError',
			'createError',
			'isFulcroError',
			'prefixError',
		]);
	});

	it('should create a coded error through the published entry point', async () => {
		const { createError, FulcroError, isFulcroError } = await import('@fulcro/errors');

		const error = createError('FULCRO6021', {
			operation: 'Vector3.from',
			field: 'x',
		});

		expect(error).toBeInstanceOf(TypeError);
		expect(error).toBeInstanceOf(FulcroError);
		expect(error.code).toBe('FULCRO6021');
		expect(error.details).toEqual({ operation: 'Vector3.from', field: 'x' });
		expect(error.message).toBe("FULCRO6021: Vector3.from: missing field 'x'.");
		expect(isFulcroError(error, 'FULCRO6021')).toBe(true);
	});

	it("should recognise an error another package's build threw", async () => {
		const { FulcroError, isFulcroError } = await import('@fulcro/errors');
		const { SignedInteger } = await import('@fulcro/types');
		const Int8 = SignedInteger(8);

		let caught: unknown;

		try {
			Int8.from(300);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(FulcroError);
		expect(caught).toBeInstanceOf(RangeError);
		expect(isFulcroError(caught, 'FULCRO6031')).toBe(true);

		expect((caught as { details: unknown }).details).toEqual({
			operation: 'SignedInteger<8>.from',
			received: '300',
			range: '[-128, 127]',
		});
	});

	it("should reach a consumer through @fulcro/types' build", async () => {
		const { SignedInteger } = await import('@fulcro/types');
		const Int32 = SignedInteger(32);

		const overflow = (): unknown => Int32.add(Int32.maximum, Int32.from(1));

		expect(overflow).toThrow(expect.objectContaining({ code: 'FULCRO6031' }));
		expect(overflow).toThrow(/^FULCRO6031: /);
	});

	it("should reach a consumer through @fulcro/parallel's build", async () => {
		// `@fulcro/parallel` imports this package by name, so the error has to
		// survive the hop between two built packages.
		const { createWorkerPool } = await import('@fulcro/parallel');

		expect(() => {
			return createWorkerPool({
				module: 'file:///nowhere.mjs',
				export: 'task',
				workers: 0,
			});
		}).toThrow(expect.objectContaining({ code: 'FULCRO3003' }));
	});
});

describe('@fulcro/parallel', () => {
	it('should expose the pool, the task scope and the cancellation, and nothing they are built from', async () => {
		const entry: Record<string, unknown> = await import('@fulcro/parallel');

		expect(Object.keys(entry).sort()).toEqual([
			'createCancellationSource',
			'createTaskScope',
			'createWorkerPool',
		]);
	});

	it('should run a scope of tasks, and read a failure through its Result', async () => {
		const { createTaskScope } = await import('@fulcro/parallel');
		const scope = createTaskScope({ concurrency: 2 });

		const doubled = scope.spawn(() => Promise.resolve(21 * 2));
		const broken = scope.spawn(() => Promise.reject(new Error('broken')));

		await expect(scope.join()).rejects.toThrow('broken');
		expect(await doubled).toBe(42);
		expect((await broken.settled).isFailure()).toBe(true);
	});

	it('should hand a parent cancellation down to a child as a platform signal', async () => {
		const { createCancellationSource } = await import('@fulcro/parallel');
		const parent = createCancellationSource();
		const child = createCancellationSource(parent.token);

		parent.cancel('stop');

		expect(child.token.signal).toBeInstanceOf(AbortSignal);
		expect(child.token.signal.reason).toBe('stop');
	});

	it('should resolve its worker entry by name, and refuse to run outside a worker', async () => {
		// The pool hands this subpath to `new Worker`. Loaded anywhere else there
		// is no parent to listen to, and it says so rather than waiting forever.
		// That holds because Vitest runs this file in a child process, not a
		// worker thread: there, `parentPort` would be Vitest's own.
		expect(resolve('@fulcro/parallel/worker')).toMatch(/[\\/]dist[\\/]worker[\\/]entry\.js$/);

		// Through `require` first, which refuses a module with a top-level await
		// outright — the refusal would then name the await rather than the worker.
		expect(() => {
			createRequire(import.meta.url)('@fulcro/parallel/worker');
		}).toThrow(expect.objectContaining({ code: 'FULCRO3002' }));

		await expect(import('@fulcro/parallel/worker')).rejects.toMatchObject({
			code: 'FULCRO3002',
		});
	});
});

describe('@fulcro/functions', () => {
	it('should expose the helpers and the constructors', async () => {
		const entry = await import('@fulcro/functions');

		for (const name of [
			'switchFor',
			'tryCatch',
			'success',
			'failure',
			'some',
			'none',
			'optionOf',
			'equals',
			'createEquals',
		] as const) {
			expect(typeof entry[name]).toBe('function');
		}
	});

	it('should hand back a result that handles both variants', async () => {
		const { tryCatch } = await import('@fulcro/functions');

		const loaded = await tryCatch(() => Promise.resolve(21));

		expect(loaded.handle({ success: (value) => value * 2, failure: () => 0 })).toBe(42);
		expect(loaded.value).toBe(21);
	});

	it('should read a nullish value as an absent option', async () => {
		const { optionOf } = await import('@fulcro/functions');

		expect(optionOf(null).isNone()).toBe(true);
		expect(optionOf(0).isSome()).toBe(true);
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
			switchFor(
				10,
				[{ when: (value): boolean => value > 5, then: (): string => 'big' }],
				() => 'small',
			),
		).toBe('big');
	});

	it('should capture a synchronous throw', async () => {
		const { tryCatch } = await import('@fulcro/functions');

		const failed = await tryCatch(() => {
			throw new Error('boom');
		});

		expect((failed.error as Error).message).toBe('boom');
	});

	it('should compare by contents through the published entry point', async () => {
		const { equals, none, some } = await import('@fulcro/functions');

		expect(equals({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] })).toBe(true);
		expect(equals<unknown>(some(null), none())).toBe(false);
	});

	it('should keep what equals is built from unexported', async () => {
		const entry = await import('@fulcro/functions');

		for (const internal of [
			'compareStructures',
			'sameValueZero',
			'isVariantPrototype',
			'variantPrototype',
		]) {
			expect(entry).not.toHaveProperty(internal);
		}
	});

	it('should take the descriptors of @fulcro/types as rules, with no dependency between them', async () => {
		const { createEquals, equals } = await import('@fulcro/functions');

		const { Decimal, DoublePrecisionFloat, Matrix, SinglePrecisionFloat, struct } =
			await import('@fulcro/types');

		const Point = struct('Point', { x: SinglePrecisionFloat, y: SinglePrecisionFloat });
		const samePoint = createEquals([Point]);

		expect(samePoint([Point.from({ x: 1, y: 2 })], [Point.from({ x: 1, y: 2 })])).toBe(true);
		// A plain object with the same fields is not a point.
		expect(samePoint<unknown>(Point.from({ x: 1, y: 2 }), { x: 1, y: 2 })).toBe(false);

		const Wide = Matrix(DoublePrecisionFloat, 2, 3);
		const Tall = Matrix(DoublePrecisionFloat, 3, 2);

		const wide: readonly number[] = Wide.from([
			[1, 2, 3],
			[4, 5, 6],
		]);

		const tall: readonly number[] = Tall.from([
			[1, 2],
			[3, 4],
			[5, 6],
		]);

		// The shape is not enumerable, so on their own the six elements look
		// alike; the descriptors tell the two shapes apart.
		expect(equals(wide, tall)).toBe(true);
		expect(createEquals([Wide, Tall])(wide, tall)).toBe(false);

		// A decimal keeps its digits in private fields, so it is an identity
		// type until a rule says how its values compare.
		expect(equals(Decimal.from('1.5'), Decimal.from('1.5'))).toBe(false);

		const byValue: EqualityRule<DecimalValue> = {
			is: Decimal.is,
			equals: (left, right) => left.equals(right),
		};

		const sameDecimal = createEquals([byValue]);

		expect(sameDecimal({ price: Decimal.from('1.5') }, { price: Decimal.from('1.50') })).toBe(true);
	});
});

describe('@fulcro/memory', () => {
	it('should expose the storage, allocator and access functions and nothing else', async () => {
		const entry = await import('@fulcro/memory');

		// `Storage`, `Allocator` and their kin are types and leave nothing at
		// runtime. A helper of the strategies showing up here — the bump region,
		// the byte storage — would be a surface nobody agreed.
		expect(
			Object.keys(entry)
				.filter((name) => name !== 'default')
				.sort(),
		).toEqual([
			'allocate',
			'asReadOnlyView',
			'asView',
			'borrow',
			'borrowMutable',
			'createArenaAllocator',
			'createFixedBufferAllocator',
			'createFixedBufferStorage',
			'createLinearMemory',
			'createManagedAllocator',
			'createManagedStorage',
			'createPoolAllocator',
			'createStackAllocator',
			'move',
			'nativePointerTo',
			'own',
			'pointerTo',
			'referenceTo',
		]);
	});

	it('should lend and move owned values, and refuse a spent owner or an ended borrow at runtime', async () => {
		const { borrow, borrowMutable, createManagedStorage, move, own } =
			await import('@fulcro/memory');

		// Nothing compiles this file through the memory transformer, so these
		// uses — refused at compile time with it — reach the runtime check, as
		// they would for a consumer who never wired the plugin up.
		const first = own(() => createManagedStorage(3, 0));
		const reading = borrow(first);

		borrowMutable(first).set(1, 7);

		expect(() => reading.get(1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7024',
				details: { operation: 'ReadOnlyView.get' },
			}),
		);

		const second = move(first);

		expect(borrow(second).get(1)).toBe(7);

		expect(() => borrow(first)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7023',
				details: { operation: 'borrow' },
			}),
		);
	});

	it('should end what a using scope declared: an owner, a pooled block, a fixed buffer', async () => {
		const { borrow, createFixedBufferAllocator, createManagedStorage, createPoolAllocator, own } =
			await import('@fulcro/memory');

		const pool = createPoolAllocator(16, 1);
		const fixed = createFixedBufferAllocator(new ArrayBuffer(16));
		let reading: ReturnType<typeof borrow<number>> | undefined;
		let owner: ReturnType<typeof own<number>> | undefined;
		let block: ReturnType<typeof pool.allocate> | undefined;
		let fixedBlock: ReturnType<typeof fixed.allocate> | undefined;

		{
			using scores = own(() => createManagedStorage(2, 5));
			using message = pool.allocate(16, 8);
			using scope = fixed;

			owner = scores;
			reading = borrow(scores);
			block = message;
			fixedBlock = scope.allocate(16, 8);
		}

		expect(() => reading.get(0)).toThrow(expect.objectContaining({ code: 'FULCRO7024' }));

		expect(() => borrow(owner)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7030',
				details: { operation: 'borrow' },
			}),
		);

		expect([block.isLive(), fixedBlock.isLive()]).toEqual([false, false]);
		expect(pool.allocate(16, 8).isLive()).toBe(true);
	});

	it('should write a field of a published struct at its bytes through a native pointer, and refuse it once released', async () => {
		const { createArenaAllocator, createLinearMemory, nativePointerTo } =
			await import('@fulcro/memory');

		const { SinglePrecisionFloat, struct } = await import('@fulcro/types');

		const Point = struct('Point', {
			x: SinglePrecisionFloat,
			y: SinglePrecisionFloat,
		});

		const Particle = struct('Particle', { position: Point, velocity: Point });

		// Without the transformers, the velocity still sits at bytes 8–15 of a
		// particle, and the pointer writes exactly those.
		const buffer = new ArrayBuffer(32);
		const raw = new DataView(buffer);
		const velocity = nativePointerTo(createLinearMemory(buffer), 8, Particle).at(8, Point);

		velocity.set(Point.from({ x: 3, y: -4 }));

		expect([raw.getFloat32(16, true), raw.getFloat32(20, true)]).toEqual([3, -4]);

		expect(
			Array.from(new Uint8Array(buffer)).flatMap((byte, address) => (byte === 0 ? [] : [address])),
		).toEqual([18, 19, 22, 23]);

		const arena = createArenaAllocator(64);
		const pointer = nativePointerTo(arena.allocate(16, 8), Particle);

		arena.reset();

		expect(() => pointer.get()).toThrow(
			expect.objectContaining({
				code: 'FULCRO7009',
				details: { operation: 'NativePointer.get' },
			}),
		);
	});

	it('should allocate a struct from the published types package, and refuse it once released', async () => {
		const { allocate, createStackAllocator } = await import('@fulcro/memory');
		const { SinglePrecisionFloat, struct } = await import('@fulcro/types');

		const Particle = struct('Particle', {
			x: SinglePrecisionFloat,
			y: SinglePrecisionFloat,
		});

		const stack = createStackAllocator(64);
		const frame = stack.enter();
		const particles = allocate(Particle, 2, frame);

		particles.set(1, Particle.from({ x: 1, y: 2 }));

		expect(particles.get(1)).toEqual({ x: 1, y: 2 });

		frame[Symbol.dispose]();

		expect(() => particles.get(1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7009',
				details: { operation: 'Storage.get' },
			}),
		);
	});

	it('should lend memory from a frame of a managed allocator, and reuse it once the frame is left', async () => {
		const { allocate, createManagedAllocator } = await import('@fulcro/memory');
		const { SignedInteger } = await import('@fulcro/types');

		const Integer = SignedInteger(32);
		const managed = createManagedAllocator();
		const frame = managed.enter();
		const counts = allocate(Integer, 2, frame);

		counts.set(1, Integer.from(7));

		expect(counts.get(1)).toBe(7);

		frame[Symbol.dispose]();

		expect(() => counts.get(1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7009',
				details: { operation: 'Storage.get' },
			}),
		);

		expect(() => frame.allocate(8, 4)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7012',
				details: { operation: 'ManagedAllocator.enter().allocate', depth: 1 },
			}),
		);

		// Leaving the first frame made the memory every later frame reuses.
		const borrowed = (): ArrayBufferLike => {
			using next = managed.enter();

			return next.allocate(8, 4).bytes.buffer;
		};

		expect(borrowed()).toBe(borrowed());
	});

	it('should store a numeric type from the published types package, with no struct around it', async () => {
		const {
			allocate,
			createArenaAllocator,
			createFixedBufferStorage,
			createLinearMemory,
			nativePointerTo,
		} = await import('@fulcro/memory');

		const { BigInteger, Decimal, SignedInteger, SinglePrecisionFloat } =
			await import('@fulcro/types');

		const samples = createFixedBufferStorage(SinglePrecisionFloat, 3);

		samples.set(1, SinglePrecisionFloat.from(0.5));

		expect([samples.get(0), samples.get(1), samples.get(2)]).toEqual([0, 0.5, 0]);

		// `Decimal` is a class, its members static: the published element check
		// has to read it for them rather than refuse it for not being an object.
		const amounts = allocate(Decimal, 2, createArenaAllocator(64));

		amounts.set(0, Decimal.from('-19.99'));

		expect(amounts.get(0).toString()).toBe('-19.99');

		const buffer = new ArrayBuffer(8);
		const count = nativePointerTo(createLinearMemory(buffer), 4, SignedInteger(32));

		count.set(SignedInteger(32).from(0x01020304));

		expect([...new Uint8Array(buffer)]).toEqual([0, 0, 0, 0, 4, 3, 2, 1]);

		expect(() => createFixedBufferStorage(BigInteger as never, 1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7003',
				details: { operation: 'createFixedBufferStorage', missing: 'layout.size' },
			}),
		);
	});

	it('should store a struct from the published types package', async () => {
		const { createFixedBufferStorage, createManagedStorage } = await import('@fulcro/memory');
		const { SinglePrecisionFloat, struct } = await import('@fulcro/types');

		const Point = struct('Point', {
			x: SinglePrecisionFloat,
			y: SinglePrecisionFloat,
		});

		const points = createFixedBufferStorage(Point, 2);
		const names = createManagedStorage(2, '');

		points.set(1, Point.from({ x: 1, y: 2 }));
		names.set(1, 'b');

		expect(points.get(1)).toEqual({ x: 1, y: 2 });
		expect(names.get(1)).toBe('b');
	});

	it('should view, point into and reference values, copying nothing', async () => {
		const { asReadOnlyView, asView, createManagedStorage, pointerTo, referenceTo } =
			await import('@fulcro/memory');

		const scores = createManagedStorage(4, 0);
		const middle = asView(scores, 1, 2);

		middle.set(0, 10);
		pointerTo(middle, 1).set(20);

		expect([scores.get(1), scores.get(2)]).toEqual([10, 20]);
		expect('set' in asReadOnlyView(middle)).toBe(false);
		expect('set' in middle.readOnly()).toBe(false);
		expect(asView(referenceTo(5)).get(0)).toBe(5);

		expect(() => middle.subview(1, 2)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7014',
				details: {
					operation: 'View.subview',
					start: 1,
					length: 2,
					available: 2,
				},
			}),
		);
	});

	it('should refuse an index outside, with its code and details', async () => {
		const { createManagedStorage } = await import('@fulcro/memory');

		expect(() => createManagedStorage(1, 0).get(1)).toThrow(
			expect.objectContaining({
				code: 'FULCRO7002',
				details: { operation: 'ManagedStorage.get', index: 1, length: 1 },
			}),
		);
	});
});

/** Bundlers every `/unplugin` entry point claims to serve. */
const BUNDLERS = ['vite', 'rollup', 'webpack', 'rspack', 'esbuild', 'farm'] as const;

describe('@fulcro/collections/transformer', () => {
	it('should expose the compiler plugin as its default export', async () => {
		const entry = await import('@fulcro/collections/transformer');

		expect(typeof entry.default).toBe('function');
	});

	it('should ship inside the package whose calls it rewrites', () => {
		expect(() => resolve('@fulcro/collections/transformer')).not.toThrow();
		expect(() => resolve('@fulcro/collections/unplugin')).not.toThrow();
	});

	it('should expose an adapter for every bundler it claims to serve', async () => {
		const adapters = await import('@fulcro/collections/unplugin');

		for (const bundler of BUNDLERS) {
			expect(typeof adapters[bundler as keyof typeof adapters]).toBe('function');
		}
	});

	it('should leave every other operator working without it', async () => {
		// The transformer of this package is optional, unlike the one in
		// `@fulcro/reflect`. Nothing compiles this file through it, so a chain
		// using the token forms has to work here exactly as it would for a
		// consumer who never wired a plugin up.
		const { SequenceCollection } = await import('@fulcro/collections');

		const values: unknown[] = ['a', 1, 'b'];

		expect(SequenceCollection.from(values).ofType('string').toArray()).toEqual(['a', 'b']);
	});

	it('should refuse the type argument form when nothing resolved it', async () => {
		const { SequenceCollection } = await import('@fulcro/collections');

		// Compiled without the plugin, so this call arrives with no token. It has
		// to say so rather than quietly keeping everything or nothing.
		expect(() => {
			return (
				SequenceCollection.from(['a']) as unknown as {
					ofType: () => unknown;
				}
			).ofType();
		}).toThrow(/was not resolved at compile time/);
	});
});

describe('@fulcro/memory/transformer', () => {
	it('should expose the compiler plugin as its default export', async () => {
		const entry = await import('@fulcro/memory/transformer');

		expect(typeof entry.default).toBe('function');
	});

	it('should ship inside the package whose calls it checks', () => {
		expect(() => resolve('@fulcro/memory/transformer')).not.toThrow();
		expect(() => resolve('@fulcro/memory/unplugin')).not.toThrow();
	});

	it('should expose an adapter for every bundler it claims to serve', async () => {
		const adapters = await import('@fulcro/memory/unplugin');

		for (const bundler of BUNDLERS) {
			expect(typeof adapters[bundler as keyof typeof adapters]).toBe('function');
		}
	});

	it('should leave the runtime package free of the compiler', () => {
		// TypeScript is an optional peer: a consumer of the runtime alone never
		// installs it, so the main entry point must not reach the transformer.
		const { manifest } = manifestOf('@fulcro/memory');

		expect(manifest.peerDependencies).toEqual({ typescript: '>=5.9 <7' });

		// Every way a module can load another: the build is ES modules, so a check
		// for `require(` alone would pass whatever the entry point imported.
		expect(readFileSync(resolve('@fulcro/memory'), 'utf8')).not.toMatch(
			/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\(\s*)["'][^"']*(transformer|typescript)/,
		);
	});
});

describe('@fulcro/reflect/transformer', () => {
	it('should expose the compiler plugin as its default export', async () => {
		const entry = await import('@fulcro/reflect/transformer');

		// What `ts-patch` loads and calls with the program.
		expect(typeof entry.default).toBe('function');
	});

	it('should ship inside the package whose calls it rewrites', () => {
		// The whole point of the restructure: installing `@fulcro/reflect` is
		// enough. Resolved the way a consumer's runtime resolves it, so a build
		// that forgot to emit either entry point fails here rather than in
		// somebody's tsconfig.
		expect(() => resolve('@fulcro/reflect/transformer')).not.toThrow();
		expect(() => resolve('@fulcro/reflect/unplugin')).not.toThrow();
	});

	it('should need nothing else installed to be wired up', () => {
		// A separate `@fulcro/transformer` used to be a peer dependency here, and
		// a consumer whose package manager did not install peers got the utilities
		// with no way to resolve them. There is nothing left to miss.
		const { manifest } = manifestOf('@fulcro/reflect');

		expect(manifest.peerDependencies ?? {}).not.toHaveProperty('@fulcro/transformer');
	});

	it('should expose an adapter for every bundler it claims to serve', async () => {
		const adapters = await import('@fulcro/reflect/unplugin');

		for (const bundler of BUNDLERS) {
			expect(typeof adapters[bundler as keyof typeof adapters]).toBe('function');
		}
	});
});

describe('@fulcro/transform-core', () => {
	it('should expose the machinery the transformers share, and nothing else', async () => {
		const entry = await import('@fulcro/transform-core');

		// The three transformers import it by name, so this is the list they
		// depend on; anything else showing up here would be a surface nobody agreed.
		expect(Object.keys(entry).sort()).toEqual([
			'IDENTIFIER_PATTERN',
			'buildStructuralTest',
			'createFileTransformer',
			'createTransformer',
			'isOwnedCall',
			'isTupleType',
			'utilityModuleSegment',
		]);
	});

	it('should expose the bundler adapter factory from its own subpath, as a .js module', async () => {
		// `./unplugin` shipped as `.mjs` before every package became an ES
		// module; a path left behind in the exports map would fail here.
		expect(resolve('@fulcro/transform-core/unplugin')).toMatch(
			/[\\/]dist[\\/]unplugin[\\/]index\.js$/,
		);

		const entry = await import('@fulcro/transform-core/unplugin');

		expect(Object.keys(entry)).toEqual(['createTransformerUnplugin']);
		expect(typeof entry.createTransformerUnplugin).toBe('function');
	});
});
