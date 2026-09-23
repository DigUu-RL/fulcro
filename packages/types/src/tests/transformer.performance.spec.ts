import * as path from 'node:path';

import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { type ProgramRewrite, rewriteProgram } from '@fulcro/transform-core';

import { SignedInteger } from '@/signedInteger';
import { OPERATOR_REWRITER } from '@/transformer/rewriter';

import { COMPILER_OPTIONS, FIXTURES } from './support/compile';

/**
 * Performance suite for the operator rewrite.
 *
 * The rewrite runs over every file of a project, before type checking, on
 * every build — so its cost is the part a consumer pays for having wired it
 * up, whether or not a file uses the types. Two costs are counted, never
 * timed: the nodes it considers, which must grow with the size of the code and
 * not faster, and the passes it takes, which must be one per link of the
 * longest chain of declarations and not one per file or per site.
 *
 * The programs are built from sources held in memory, named as if they sat
 * beside the fixtures, so `@fulcro/types` resolves through `node_modules` as
 * it does for them and nothing is written to disk.
 */

/**
 * Rewrites a program made of one generated source.
 *
 * @param source Text of the source.
 * @returns What the rewrite did.
 */
const rewriteSource = (source: string): ProgramRewrite => {
	const fileName: string = path
		.join(FIXTURES, 'generated.ts')
		.replace(/\\/g, '/');
	const base: ts.CompilerHost = ts.createCompilerHost(COMPILER_OPTIONS, true);

	const host: ts.CompilerHost = {
		...base,
		getSourceFile: (name, options, onError, shouldCreate) =>
			name.replace(/\\/g, '/') === fileName
				? ts.createSourceFile(name, source, options, true)
				: base.getSourceFile(name, options, onError, shouldCreate),
		fileExists: (name) =>
			name.replace(/\\/g, '/') === fileName || base.fileExists(name),
		readFile: (name) =>
			name.replace(/\\/g, '/') === fileName ? source : base.readFile(name),
	};

	const program: ts.Program = ts.createProgram(
		[fileName],
		COMPILER_OPTIONS,
		host,
	);

	return rewriteProgram(program, host, OPERATOR_REWRITER).rewrite;
};

/**
 * A source of independent statements, each one claimable on the first pass.
 *
 * @param statements How many statements.
 * @returns The source.
 */
const independent = (statements: number): string =>
	[
		"import { SignedInteger } from '@fulcro/types';",
		'const Int32 = SignedInteger(32);',
		'const a = Int32.from(1);',
		...Array.from(
			{ length: statements },
			(_, index) => `export const v${index} = a + a * a;`,
		),
	].join('\n');

/**
 * A chain of declarations, each only claimable once the one before it is.
 *
 * @param links How many links.
 * @returns The source.
 */
const chain = (links: number): string =>
	[
		"import { SignedInteger } from '@fulcro/types';",
		'const a = SignedInteger(32).from(1);',
		'const v0 = a + a;',
		...Array.from(
			{ length: links - 1 },
			(_, index) => `const v${index + 1} = v${index} + v${index};`,
		),
		`export const last = v${links - 1};`,
	].join('\n');

describe('the operator rewrite', { timeout: 60_000 }, () => {
	it('should consider a number of nodes proportional to the code', () => {
		const small: ProgramRewrite = rewriteSource(independent(100));
		const large: ProgramRewrite = rewriteSource(independent(1_000));

		// Ten times the statements, and — since nothing chains — the same
		// number of passes, so the same multiple of nodes. A rewrite that
		// re-walked the file per site would read a hundred times more.
		expect(small.passes).toBe(large.passes);

		const ratio: number = large.statistics.visited / small.statistics.visited;

		expect(ratio).toBeGreaterThan(9);
		expect(ratio).toBeLessThan(11);
	});

	it('should rewrite each site once', () => {
		const rewrite: ProgramRewrite = rewriteSource(independent(1_000));

		// `a + a * a` is two operators: the product on the first pass, the sum
		// around it on the same pass, since `a` is already typed.
		expect(rewrite.statistics.rewritten).toBe(2_000);
	});

	it('should take one pass per link of a chain, and one more to see it is done', () => {
		for (const links of [1, 3, 6]) {
			expect(rewriteSource(chain(links)).passes).toBe(links + 1);
		}
	});

	it('should rewrite nothing in a large file with none of these types', () => {
		const plain: string = Array.from(
			{ length: 2_000 },
			(_, index) => `export const n${index} = ${index} + ${index} * 2;`,
		).join('\n');

		const rewrite: ProgramRewrite = rewriteSource(plain);

		expect(rewrite.statistics.rewritten).toBe(0);
		expect(rewrite.passes).toBe(1);
		expect(rewrite.files.size).toBe(0);
	});

	it('should emit a call that costs a small multiple of calling the descriptor directly', () => {
		const Int32 = SignedInteger(32);
		const one = Int32.from(1);
		const calls = 200_000;

		/**
		 * Times a loop of additions.
		 *
		 * @param add The addition.
		 * @returns Milliseconds taken, never less than one.
		 */
		const timed = (add: () => number): number => {
			let sink = 0;
			const started: number = performance.now();

			for (let call = 0; call < calls; call++) sink += add();

			if (sink !== calls * 2) {
				throw new Error('unreachable: every addition is 2');
			}

			return Math.max(performance.now() - started, 1);
		};

		// What the rewrite emits looks the descriptor up on every operation;
		// the baseline is the descriptor held in a variable.
		const direct: number = timed(() => Int32.add(one, one));
		const emitted: number = timed(() => SignedInteger(32).add(one, one));

		expect(emitted).toBeLessThan(direct * 5);
	});
});
