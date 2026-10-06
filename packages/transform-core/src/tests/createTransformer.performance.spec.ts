import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { FileAnalyzer } from '@/shared';
import { createTransformer } from '@/transformer';

import { createWorkspace } from './workspace';

/**
 * Performance suite for `createTransformer`, on the analyzers it runs.
 *
 * Counted, never timed (`docs/testing.md`). An analyzer exists so that a
 * question about a whole file is asked once per file, not once per call in it,
 * so what is counted is how often each analyzer is invoked.
 */

/** Files in the program. */
const FILES = 20;

/** Calls in each file: enough that a per-call invocation would stand out. */
const CALLS = 200;

let workspace: { root: string; remove: () => void };
let program: typescript.Program;
let fileNames: string[];

beforeAll(() => {
	const body: string = [
		'const flag = (value: number): number => value;',
		...Array.from({ length: CALLS }, (_, index) => `flag(${index});`),
		'',
	].join('\n');
	const files: Record<string, string> = {};

	for (let index = 0; index < FILES; index++) {
		files[`src/file${index}.ts`] = body;
	}

	workspace = createWorkspace(files);
	fileNames = Object.keys(files).map((name) =>
		path.join(workspace.root, ...name.split('/')),
	);
	program = typescript.createProgram(fileNames, {
		module: typescript.ModuleKind.ESNext,
		strict: true,
	});
});

afterAll(() => {
	workspace.remove();
});

describe('createTransformer with analyzers, counted', () => {
	it('should invoke each analyzer once per file, however many calls it holds', () => {
		const counts: number[] = [0, 0];
		const counting = (slot: 0 | 1): FileAnalyzer => ({
			functionNames: ['flag'],
			analyze: (): void => {
				counts[slot]++;
			},
		});
		const transformer = createTransformer(
			[],
			[counting(0), counting(1)],
		)(program);

		for (const fileName of fileNames) {
			const source = program.getSourceFile(
				fileName.split(path.sep).join('/'),
			) as typescript.SourceFile;

			typescript.transform(source, [transformer]).dispose();
		}

		expect(counts).toEqual([FILES, FILES]);
	});
});
