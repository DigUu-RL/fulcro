import * as fileSystem from 'node:fs';
import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createFileTransformer } from '@/src/program';
import type { CallRewriter, FileAnalyzer, StatementRewriter } from '@/src/shared';
import { createWorkspace } from '@/src/tests/workspace';

/**
 * Behaviour suite for `createFileTransformer`, the core of every bundler
 * plugin, on the analyzers it runs.
 *
 * A bundler has no checker of its own, so this core is where an analyzer's
 * refusal becomes a failed build — and where a file nothing rewrote has to
 * come back as `null`, so the bundler keeps the original and its source map.
 */

let workspace: { root: string; remove: () => void };

beforeAll(() => {
	workspace = createWorkspace({
		'tsconfig.json': JSON.stringify({
			compilerOptions: { strict: true, module: 'ESNext' },
			include: ['src'],
		}),
		'src/checked.ts': [
			'const flag = (value: number): number => value;',
			'export const first = flag(1);',
			'',
		].join('\n'),
		'src/mentions.ts': [
			'// neverCalled is named here and called nowhere',
			'export const value = 1;',
			'',
		].join('\n'),
		'src/untouched.ts': ['// mentions flag in a comment only', 'export const value = 1;', ''].join(
			'\n',
		),
		'src/scoped.ts': [
			'const scope = (value: number): number => value;',
			'export const run = (): number => {',
			'\tconst value = scope(1);',
			'\treturn value;',
			'};',
			'',
		].join('\n'),
	});
});

afterAll(() => {
	workspace.remove();
});

/** Refuses the second statement of any file that has one calling `flag`. */
const flagging: FileAnalyzer = {
	functionNames: ['flag'],
	analyze: (sourceFile, context): void => {
		const statement = sourceFile.statements[1];

		if (!statement?.getText().includes('flag(')) {
			return;
		}

		context.report(statement, 'FULCRO5999: flag is refused here.');
	},
};

/** Claims nothing anybody calls. */
const unused: CallRewriter = {
	functionName: 'neverCalled',
	moduleSegment: 'nowhere',
	rewrite: () => null,
};

/** Puts `opened();` before the first statement of every block. */
const opening: StatementRewriter = {
	functionNames: ['scope'],
	rewrite: (statement, context) => {
		const block: typescript.Node = typescript.getOriginalNode(statement).parent;

		if (!typescript.isBlock(block) || block.statements[0] !== statement) return null;

		return [
			context.factory.createExpressionStatement(
				context.factory.createCallExpression(
					context.factory.createIdentifier('opened'),
					undefined,
					[],
				),
			),
			statement,
		];
	},
};

/**
 * Transforms one file of the workspace.
 *
 * @param name File under `src`.
 * @param analyzers Analyzers of the core.
 * @param statementRewriters Statement rewriters of the core.
 * @returns What the core handed back.
 */
const transform = (
	name: string,
	analyzers: readonly FileAnalyzer[],
	statementRewriters: readonly StatementRewriter[] = [],
): string | null => {
	const fileName: string = path.join(workspace.root, 'src', name);

	return createFileTransformer(
		[unused],
		{ root: workspace.root },
		analyzers,
		statementRewriters,
	).transform(fileName, fileSystem.readFileSync(fileName, 'utf8'));
};

/** What each transformation handed back, or the error it threw. */
let checked: unknown;
let untouched: string | null;
let mentions: string | null;
let scoped: string | null;

// Each transformation builds a language service and checks a program — the
// costly part, and not what is asserted — so they run under the hook's
// generous ceiling rather than a test's. Inside a test, one crossed the
// default five seconds in a full run, competing with every other project.
beforeAll(() => {
	try {
		transform('checked.ts', [flagging]);
		checked = null;
	} catch (error: unknown) {
		checked = error;
	}

	untouched = transform('untouched.ts', [flagging]);
	mentions = transform('mentions.ts', []);
	scoped = transform('scoped.ts', [], [opening]);
});

describe('createFileTransformer with analyzers', () => {
	it('should fail the build over a refusal an analyzer reports', () => {
		expect(checked).toBeInstanceOf(Error);
		expect((checked as Error).message).toMatch(/FULCRO5003[\s\S]*checked\.ts\(2,1\): FULCRO5999/);
	});

	it('should hand back null for a file nothing rewrote', () => {
		expect(untouched).toBeNull();
	});

	it('should hand back null for a file naming a rewriter it never calls', () => {
		expect(mentions).toBeNull();
	});

	it('should rewrite a file only a statement rewriter names, and print it', () => {
		expect(scoped).toMatch(/opened\(\);\s+const value = scope\(1\);/);
	});
});
