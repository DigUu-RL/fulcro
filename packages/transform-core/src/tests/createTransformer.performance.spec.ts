import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import type { FileAnalyzer, StatementRewriter } from '@/src/shared';
import { createWorkspace } from '@/src/tests/workspace';
import { createTransformer } from '@/src/transformer';

/**
 * Performance suite for `createTransformer`, on the analyzers and the
 * statement rewriters it runs.
 *
 * Counted, never timed (`docs/testing.md`). An analyzer exists so that a
 * question about a whole file is asked once per file, not once per call in it,
 * so what is counted is how often each analyzer is invoked; a statement
 * rewriter is asked once per statement, never again for what it declined.
 */

/** Files in the program. */
const FILES = 20;

/** Calls in each file: enough that a per-call invocation would stand out. */
const CALLS = 200;

/** Functions in the file of blocks. */
const BLOCKS = 20;

let workspace: { root: string; remove: () => void };
let program: typescript.Program;
let fileNames: string[];
let blockFileName: string;

beforeAll(() => {
	const body: string = [
		'const flag = (value: number): number => value;',
		...Array.from({ length: CALLS }, (_, index) => `flag(${String(index)});`),
		'',
	].join('\n');

	const files: Record<string, string> = {};

	for (let index = 0; index < FILES; index++) {
		files[`src/file${String(index)}.ts`] = body;
	}

	files['src/blocks.ts'] = [
		'const flag = (value: number): number => value;',
		...Array.from({ length: BLOCKS }, (_, block) => {
			return [
				`export const run${String(block)} = (): number => {`,
				...Array.from({ length: CALLS }, (_, index) => `\tflag(${String(index)});`),
				'\treturn 0;',
				'};',
			].join('\n');
		}),
		'',
	].join('\n');

	workspace = createWorkspace(files);

	const paths: string[] = Object.keys(files).map((name) => {
		return path.join(workspace.root, ...name.split('/'));
	});

	fileNames = paths.filter((name) => !name.endsWith('blocks.ts'));
	blockFileName = paths.find((name) => name.endsWith('blocks.ts')) ?? '';

	program = typescript.createProgram(paths, {
		module: typescript.ModuleKind.ESNext,
		strict: true,
	});
});

afterAll(() => {
	workspace.remove();
});

describe('createTransformer with analyzers, counted', () => {
	it('should invoke each analyzer once per file, however many calls it holds', () => {
		const counts: [number, number] = [0, 0];

		const counting = (slot: 0 | 1): FileAnalyzer => {
			return {
				functionNames: ['flag'],
				analyze: (): void => {
					counts[slot]++;
				},
			};
		};

		const transformer = createTransformer([], [counting(0), counting(1)])(program);

		for (const fileName of fileNames) {
			const source: typescript.SourceFile | undefined = program.getSourceFile(
				fileName.split(path.sep).join('/'),
			);

			assert.isDefined(source);
			typescript.transform(source, [transformer]).dispose();
		}

		expect(counts).toEqual([FILES, FILES]);
	});

	it('should offer each statement of a block to a statement rewriter once', () => {
		let offered = 0;

		const counting: StatementRewriter = {
			functionNames: ['flag'],
			rewrite: () => {
				offered++;

				return null;
			},
		};

		const transformer = createTransformer([], [], [counting])(program);

		const source: typescript.SourceFile | undefined = program.getSourceFile(
			blockFileName.split(path.sep).join('/'),
		);

		assert.isDefined(source);
		typescript.transform(source, [transformer]).dispose();

		// The top level is not a block; each function body holds its calls, and
		// one statement more for the return.
		expect(offered).toBe(BLOCKS * (CALLS + 1));
	});
});
