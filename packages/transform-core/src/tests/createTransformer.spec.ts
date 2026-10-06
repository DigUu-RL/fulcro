import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CallRewriter, FileAnalyzer } from '@/shared';
import { createTransformer } from '@/transformer';

import { createWorkspace } from './workspace';

/**
 * Behaviour suite for `createTransformer`, on the analyzers it runs.
 *
 * An analyzer checks a file without rewriting it, before any rewriter runs,
 * and refuses code the way a rewriter does: through `addDiagnostic` when the
 * compiler offers it, and otherwise as one error once the file is walked.
 */

let workspace: { root: string; remove: () => void };
let program: typescript.Program;
let fixture: typescript.SourceFile;

beforeAll(() => {
	workspace = createWorkspace({
		'src/fixture.ts': [
			'const rename = (value: number): number => value;',
			'const flag = (value: number): number => value;',
			'export const first = flag(1);',
			'export const second = rename(flag(2));',
			'',
		].join('\n'),
	});

	const fileName: string = path.join(workspace.root, 'src', 'fixture.ts');

	program = typescript.createProgram([fileName], {
		module: typescript.ModuleKind.ESNext,
		target: typescript.ScriptTarget.ES2022,
		strict: true,
	});
	fixture = program.getSourceFile(
		fileName.split(path.sep).join('/'),
	) as typescript.SourceFile;
});

afterAll(() => {
	workspace.remove();
});

/**
 * Reports every call to `flag`, and records what it was handed.
 *
 * @param seen Receives the text of each file the analyzer was given.
 * @returns The analyzer.
 */
const flagging = (seen: string[]): FileAnalyzer => ({
	functionNames: ['flag'],
	analyze: (sourceFile, context): void => {
		seen.push(sourceFile.getText());

		const visit = (node: typescript.Node): void => {
			if (
				typescript.isCallExpression(node) &&
				typescript.isIdentifier(node.expression) &&
				node.expression.text === 'flag'
			) {
				context.report(node, 'FULCRO5999: flag is refused here.');
			}

			typescript.forEachChild(node, visit);
		};

		visit(sourceFile);
	},
});

/**
 * Turns every call to `rename` into a call to `renamed`, visiting its
 * arguments with the whole transformer.
 */
const renaming: CallRewriter = {
	functionName: 'rename',
	moduleSegment: 'fixture',
	rewrite: (call, context) =>
		context.factory.updateCallExpression(
			call,
			context.factory.createIdentifier('renamed'),
			undefined,
			call.arguments.map(
				(argument) => context.visit(argument) as typescript.Expression,
			),
		),
};

/**
 * Applies a transformer to the fixture.
 *
 * @param analyzers Analyzers to build it with.
 * @param addDiagnostic What the compiler offers for reporting, if anything.
 * @returns The printed result.
 */
const run = (
	analyzers: readonly FileAnalyzer[],
	addDiagnostic?: (diagnostic: typescript.Diagnostic) => unknown,
): string => {
	const result = typescript.transform(fixture, [
		createTransformer([renaming], analyzers)(program, {}, { addDiagnostic }),
	]);
	const printed: string = typescript
		.createPrinter()
		.printFile(result.transformed[0] as typescript.SourceFile);

	result.dispose();

	return printed;
};

describe('createTransformer with analyzers', () => {
	it('should hand each analyzer the file as written, before any rewriter', () => {
		const seen: string[] = [];

		run([flagging(seen)], () => undefined);

		expect(seen).toEqual([fixture.getText()]);
		expect(seen[0]).toContain('rename(flag(2))');
	});

	it('should report through addDiagnostic, located at the node', () => {
		const diagnostics: typescript.Diagnostic[] = [];

		run([flagging([])], (diagnostic) => diagnostics.push(diagnostic));

		expect(
			diagnostics.map((diagnostic) => ({
				code: diagnostic.code,
				text: fixture.text.slice(
					diagnostic.start,
					(diagnostic.start ?? 0) + (diagnostic.length ?? 0),
				),
				source: diagnostic.source,
			})),
		).toEqual([
			{ code: 5999, text: 'flag(1)', source: 'fulcro' },
			{ code: 5999, text: 'flag(2)', source: 'fulcro' },
		]);
	});

	it('should throw every refusal of the file at once without addDiagnostic', () => {
		expect(() => run([flagging([])])).toThrow(
			/FULCRO5003[\s\S]*fixture\.ts\(3,22\): FULCRO5999[\s\S]*fixture\.ts\(4,30\): FULCRO5999/,
		);
	});

	it('should still apply the rewriters', () => {
		const printed: string = run([flagging([])], () => undefined);

		expect(printed).toContain('renamed(flag(2))');
	});

	it('should hand the analyzer the file as written when another transformer ran first', () => {
		const seen: typescript.SourceFile[] = [];
		const recording: FileAnalyzer = {
			functionNames: ['flag'],
			analyze: (sourceFile): void => {
				seen.push(sourceFile);
			},
		};
		const result = typescript.transform(fixture, [
			createTransformer([renaming])(program),
			createTransformer([], [recording])(program),
		]);

		result.dispose();

		expect(seen).toEqual([fixture]);
	});

	it('should rewrite as before with no analyzer at all', () => {
		expect(run([])).toContain('renamed(flag(2))');
	});
});
