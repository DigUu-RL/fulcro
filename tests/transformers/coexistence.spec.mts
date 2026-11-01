import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import typescript from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Coexistence suite.
 *
 * Each package tests its own transformer alone, which proves each one works and
 * proves nothing about them together. A consumer using several libraries
 * applies their plugins to the same compilation, and there is no other coverage
 * of that: they walk the same tree, and one replacing a node another still
 * needed to visit would break quietly — the file would compile, the call would
 * be left as written, and only a runtime refusal much later would say so.
 *
 * So this compiles one fixture with all three applied and asserts that
 * **every** call came out resolved, that memory's plugin still refuses, and
 * that the one declaration it rewrites — a whole statement rather than a call —
 * still has the calls inside it rewritten by the other two.
 */

/** Resolves the built packages the way a consumer's compiler would. */
const require = createRequire(import.meta.url);

/** Root of the repository, which this file sits two levels below. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Fixture fed to the compiler. */
const FIXTURE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'coexistence.sample.ts');

/** JavaScript emitted for the fixture, shared by every assertion. */
let emitted = '';

/**
 * Compiles the fixture with all three transformers applied.
 *
 * @returns The emitted JavaScript.
 */
const compileFixture = (): string => {
	const reflect = (
		require('@fulcro/reflect/transformer') as {
			readonly default: (
				program: typescript.Program,
			) => typescript.TransformerFactory<typescript.SourceFile>;
		}
	).default;

	const collections = (
		require('@fulcro/collections/transformer') as { readonly default: typeof reflect }
	).default;

	const memory = (require('@fulcro/memory/transformer') as { readonly default: typeof reflect })
		.default;

	const program: typescript.Program = typescript.createProgram([FIXTURE], {
		target: typescript.ScriptTarget.ES2022,
		module: typescript.ModuleKind.ESNext,
		// `Bundler`, because `Node10` finds a package's main entry but not its
		// `exports` subpaths — and a type the checker cannot see is a call
		// neither transformer can claim, silently.
		moduleResolution: typescript.ModuleResolutionKind.Bundler,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	const errors: readonly typescript.Diagnostic[] = typescript
		.getPreEmitDiagnostics(program, program.getSourceFile(FIXTURE))
		.filter((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error);

	if (errors.length > 0) {
		throw new Error(
			typescript.formatDiagnostics(errors, {
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
		// All three, in one pass over one tree. The order is deliberate and
		// arbitrary: none should depend on running first. Memory's goes last, so
		// it walks the tree the other two produced — with calls inside its
		// borrows already rewritten — and must refuse nothing here.
		{ before: [reflect(program), collections(program), memory(program)] },
	);

	return output;
};

beforeAll(() => {
	emitted = compileFixture();
});

describe('the plugins on one file', () => {
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

	it("should leave @fulcro/memory's calls as written, and rewrite the others inside them", () => {
		const start: number = emitted.indexOf('export const owned');
		const block: string = emitted.slice(start);

		expect(start).toBeGreaterThan(-1);
		expect(block).toContain('borrow(move(orders))');
		expect(block).toMatch(/is\(first, \{ name: "Order"/);
		expect(block).toMatch(/\.ofType\(\{ name: "Order"/);
	});

	it("should move @fulcro/memory's storage into a frame, and rewrite the others' calls in the same block", () => {
		const start: number = emitted.indexOf('export const scoped');
		const block: string = emitted.slice(start);

		expect(start).toBeGreaterThan(-1);

		// Emitted for ES2022, where `using` is lowered: the frame is entered as a
		// disposable resource of the block, and the allocation is made from it.
		const frame: string | undefined =
			/(frame_\d+) = __addDisposableResource\(env_\d+, managed\.enter\(\), false\)/.exec(
				block,
			)?.[1];

		expect(frame).toBeDefined();

		// The length argument kept by the statement rewrite was still rewritten by
		// reflect, which ran first: `nameOf<Order>()` is replaced by the name.
		expect(block).toMatch(new RegExp(`allocate\\(Integer, "Order"\\.length, ${String(frame)}\\)`));
		expect(block).toMatch(/\.ofType\(\{ name: "Order"/);
		expect(block).toMatch(/is\(payload, \{ name: "Order"/);
	});

	it('should still refuse a use after move among calls the others rewrite', () => {
		const rejected: string = path.resolve(
			path.dirname(fileURLToPath(import.meta.url)),
			'coexistence.rejected.sample.ts',
		);

		const reflect = (
			require('@fulcro/reflect/transformer') as {
				readonly default: (
					program: typescript.Program,
				) => typescript.TransformerFactory<typescript.SourceFile>;
			}
		).default;

		const memory = (require('@fulcro/memory/transformer') as { readonly default: typeof reflect })
			.default;

		const program: typescript.Program = typescript.createProgram([rejected], {
			target: typescript.ScriptTarget.ES2022,
			module: typescript.ModuleKind.ESNext,
			moduleResolution: typescript.ModuleResolutionKind.Bundler,
			strict: true,
			skipLibCheck: true,
		});

		expect(() => {
			return program.emit(program.getSourceFile(rejected), () => undefined, undefined, false, {
				before: [reflect(program), memory(program)],
			});
		}).toThrow(
			/coexistence\.rejected\.sample\.ts\(19,26\): FULCRO7027: move: 'orders' is used after it was moved at line 17/,
		);
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
