import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite for the ownership rules.
 *
 * Compiles two fixtures with the transformer applied. Both import
 * `@fulcro/memory` by name, so every call is recognised across the package
 * boundary — through the built declarations — as it is in a consumer's
 * project.
 *
 * The rejected fixture marks each line that must be refused with the code it
 * must be refused with, so what this suite compares is what the transformer
 * reported against what the fixture says, line for line.
 */

/** Options every fixture compiles with. */
const COMPILER_OPTIONS: ts.CompilerOptions = {
	target: ts.ScriptTarget.ES2022,
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	strict: true,
	noEmitOnError: false,
	skipLibCheck: true,
};

/** What compiling one fixture produced. */
interface Compiled {
	readonly source: ts.SourceFile;
	readonly emitted: string;
	readonly errors: readonly ts.Diagnostic[];
	readonly refused: readonly ts.Diagnostic[];
}

/**
 * Compiles fixtures with the transformer applied, in one program.
 *
 * @param fileNames Fixtures beside this suite.
 * @returns For each fixture, its source, its emitted JavaScript, the errors of
 * the compiler and the refusals of the transformer.
 */
const compile = (...fileNames: string[]): Compiled[] => {
	const fixtures: string[] = fileNames.map((fileName) =>
		path.resolve(__dirname, fileName),
	);
	const program: ts.Program = ts.createProgram(fixtures, COMPILER_OPTIONS);

	return fixtures.map((fixture) => {
		const source = program.getSourceFile(fixture) as ts.SourceFile;
		const refused: ts.Diagnostic[] = [];
		let emitted = '';

		program.emit(
			source,
			(name, text) => {
				if (name.endsWith('.js')) emitted = text;
			},
			undefined,
			false,
			{
				before: [
					transformer(program, undefined, {
						addDiagnostic: (diagnostic) => refused.push(diagnostic),
					}),
				],
			},
		);

		const errors: readonly ts.Diagnostic[] = ts
			.getPreEmitDiagnostics(program, source)
			.filter(
				(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
			);

		return { source, emitted, errors, refused };
	});
};

/**
 * Where a diagnostic points, and its code.
 *
 * @param diagnostic The diagnostic.
 * @returns `line: FULCROnnnn`, the line counted from 1.
 */
const located = (diagnostic: ts.Diagnostic): string => {
	const { line } = ts.getLineAndCharacterOfPosition(
		diagnostic.file as ts.SourceFile,
		diagnostic.start ?? 0,
	);

	return `${line + 1}: FULCRO${diagnostic.code}`;
};

let accepted: Compiled;
let rejected: Compiled;

beforeAll(() => {
	[accepted, rejected] = compile(
		'ownership.sample.ts',
		'ownership.rejected.fixture.ts',
	);
});

describe('ownership rules at compile time', () => {
	it('should compile both fixtures without type errors', () => {
		expect(
			[...accepted.errors, ...rejected.errors].map((error) =>
				ts.flattenDiagnosticMessageText(error.messageText, '\n'),
			),
		).toEqual([]);
	});

	it('should refuse nothing a correct program does', () => {
		expect(
			accepted.refused.map(
				(diagnostic) =>
					`${located(diagnostic)} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
			),
		).toEqual([]);
	});

	it('should refuse exactly the lines the fixture marks, with their codes', () => {
		const marked: string[] = rejected.source.text
			.split(/\r?\n/)
			.flatMap((line, index) => {
				const code: string | undefined = /\/\/ (FULCRO\d{4})$/.exec(line)?.[1];

				return code === undefined ? [] : [`${index + 1}: ${code}`];
			});

		expect(marked.length).toBeGreaterThan(10);
		expect(rejected.refused.map(located)).toEqual(marked);
	});

	it('should point at the use, and say where the move was', () => {
		const [first] = rejected.refused;
		const start: number = first?.start ?? -1;

		expect(rejected.source.text.slice(start, start + 'owner'.length)).toBe(
			'owner',
		);
		expect(first?.messageText).toBe(
			"FULCRO7027: move: 'owner' is used after it was moved at line 24; use the owner move returned.",
		);
	});

	it('should name the conflicting borrow and the owner of an ended one', () => {
		const messages: string[] = rejected.refused.map((diagnostic) =>
			String(diagnostic.messageText),
		);

		expect(messages).toContain(
			"FULCRO7028: borrow: the borrow 'reading' is used after borrowMutable(owner) at line 47 ended it.",
		);
		expect(messages).toContain(
			"FULCRO7029: borrow: the borrow 'reading' is used after its owner 'owner' was moved at line 74.",
		);
	});

	it('should rewrite nothing, leaving every call to the runtime', () => {
		expect(accepted.emitted).toContain('borrow(owner)');
		expect(accepted.emitted).toContain('move(owner)');
		expect(rejected.emitted).toContain('borrow(owner); // FULCRO7027');
	});
});
