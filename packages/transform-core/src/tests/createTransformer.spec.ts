import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import type { CallRewriter, FileAnalyzer, StatementRewriter } from '@/src/shared';
import { createWorkspace } from '@/src/tests/workspace';
import { createTransformer } from '@/src/transformer';

/**
 * Behaviour suite for `createTransformer`, on the analyzers and the statement
 * rewriters it runs.
 *
 * An analyzer checks a file without rewriting it, before any rewriter runs,
 * and refuses code the way a rewriter does: through `addDiagnostic` when the
 * compiler offers it, and otherwise as one error once the file is walked. A
 * statement rewriter replaces a statement of a block with statements of its
 * own, which the rest of the transformer then walks.
 */

let workspace: { root: string; remove: () => void };
let program: typescript.Program;
let fixture: typescript.SourceFile;
let blocks: typescript.SourceFile;

beforeAll(() => {
	workspace = createWorkspace({
		'src/fixture.ts': [
			'const rename = (value: number): number => value;',
			'const flag = (value: number): number => value;',
			'export const first = flag(1);',
			'export const second = rename(flag(2));',
			'',
		].join('\n'),
		'src/blocks.fixture.ts': [
			'const rename = (value: number): number => value;',
			'const scope = (value: number): number => value;',
			'export const run = (): number => {',
			'\tconst first = scope(1);',
			'\tif (first > 0) {',
			'\t\tconst second = scope(rename(2));',
			'\t\treturn second;',
			'\t}',
			'\treturn first;',
			'};',
			'export const untouched = (): number => {',
			'\treturn rename(3);',
			'};',
			'',
		].join('\n'),
	});

	const fileNames: string[] = ['fixture.ts', 'blocks.fixture.ts'].map((name) => {
		return path.join(workspace.root, 'src', name);
	});

	program = typescript.createProgram(fileNames, {
		module: typescript.ModuleKind.ESNext,
		target: typescript.ScriptTarget.ES2022,
		strict: true,
	});

	const [source, blocksSource] = fileNames.map((fileName) => {
		return program.getSourceFile(fileName.split(path.sep).join('/'));
	});

	assert.isDefined(source);
	assert.isDefined(blocksSource);
	fixture = source;
	blocks = blocksSource;
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
const flagging = (seen: string[]): FileAnalyzer => {
	return {
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
	};
};

/**
 * Turns every call to `rename` into a call to `renamed`, visiting its
 * arguments with the whole transformer.
 */
const renaming: CallRewriter = {
	functionName: 'rename',
	moduleSegment: 'fixture',
	rewrite: (call, context) => {
		return context.factory.updateCallExpression(
			call,
			context.factory.createIdentifier('renamed'),
			undefined,
			call.arguments.map((argument) => context.visit(argument) as typescript.Expression),
		);
	},
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
		createTransformer([renaming], analyzers)(
			program,
			{},
			addDiagnostic === undefined ? {} : { addDiagnostic },
		),
	]);

	const [transformed] = result.transformed;

	assert.isDefined(transformed);

	const printed: string = typescript.createPrinter().printFile(transformed);

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
			diagnostics.map((diagnostic) => {
				return {
					code: diagnostic.code,
					text: fixture.text.slice(
						diagnostic.start,
						(diagnostic.start ?? 0) + (diagnostic.length ?? 0),
					),
					source: diagnostic.source,
				};
			}),
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

/**
 * Puts `opened();` before every declaration whose value is a call to `scope`,
 * keeping the declaration as it was.
 */
const scoping: StatementRewriter = {
	functionNames: ['scope'],
	rewrite: (statement, context) => {
		if (!typescript.isVariableStatement(statement)) return null;

		const [declaration] = statement.declarationList.declarations;
		const value: typescript.Expression | undefined = declaration?.initializer;

		const scoped: boolean =
			value !== undefined &&
			typescript.isCallExpression(value) &&
			typescript.isIdentifier(value.expression) &&
			value.expression.text === 'scope';

		if (!scoped) return null;

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
 * Applies a transformer with statement rewriters to the file of blocks.
 *
 * @param statementRewriters Statement rewriters to build it with.
 * @returns The transformed file, and the file as printed.
 */
const runOnBlocks = (
	statementRewriters: readonly StatementRewriter[],
): { transformed: typescript.SourceFile; printed: string } => {
	const result = typescript.transform(blocks, [
		createTransformer([renaming], [], statementRewriters)(program),
	]);

	const [transformed] = result.transformed;

	assert.isDefined(transformed);

	const printed: string = typescript.createPrinter().printFile(transformed);

	result.dispose();

	return { transformed, printed };
};

describe('createTransformer with statement rewriters', () => {
	it('should put what a statement rewriter returns in place of the statement, in every block', () => {
		const { printed } = runOnBlocks([scoping]);

		expect(printed).toMatch(/opened\(\);\s+const first = scope\(1\);/);
		expect(printed).toMatch(/opened\(\);\s+const second = scope\(renamed\(2\)\);/);
	});

	it('should apply the call rewriters inside what a statement rewriter keeps', () => {
		expect(runOnBlocks([scoping]).printed).toContain('scope(renamed(2))');
	});

	it('should leave the statements no rewriter answers for, and their calls rewritten', () => {
		const { printed } = runOnBlocks([scoping]);

		expect(printed.match(/opened\(\)/g)).toHaveLength(2);
		expect(printed).toContain('renamed(3)');
	});

	it('should hand back the same file when no statement rewriter answers and no call is claimed', () => {
		const declining: StatementRewriter = { functionNames: ['scope'], rewrite: () => null };

		const result = typescript.transform(blocks, [createTransformer([], [], [declining])(program)]);

		expect(result.transformed[0]).toBe(blocks);

		result.dispose();
	});

	it('should give a statement to the first rewriter that answers, and ask no other', () => {
		const asked: string[] = [];

		const after: StatementRewriter = {
			functionNames: ['scope'],
			rewrite: (statement) => {
				asked.push(statement.getText());

				return null;
			},
		};

		runOnBlocks([scoping, after]);

		expect(asked).not.toContain('const first = scope(1);');
		expect(asked).toContain('return first;');
	});
});
