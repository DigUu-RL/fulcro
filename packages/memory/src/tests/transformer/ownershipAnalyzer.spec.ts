import * as path from 'node:path';

import * as typescript from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/src/transformer';

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
const COMPILER_OPTIONS: typescript.CompilerOptions = {
	target: typescript.ScriptTarget.ES2022,
	module: typescript.ModuleKind.ESNext,
	moduleResolution: typescript.ModuleResolutionKind.Bundler,
	strict: true,
	noEmitOnError: false,
	skipLibCheck: true,
};

/** What compiling one fixture produced. */
interface Compiled {
	readonly source: typescript.SourceFile;
	readonly emitted: string;
	readonly errors: readonly typescript.Diagnostic[];
	readonly refused: readonly typescript.Diagnostic[];
}

/**
 * Compiles fixtures with the transformer applied, in one program.
 *
 * @param fileNames Fixtures beside this suite.
 * @returns For each fixture, its source, its emitted JavaScript, the errors of
 * the compiler and the refusals of the transformer.
 */
const compile = (...fileNames: string[]): Compiled[] => {
	const fixtures: string[] = fileNames.map((fileName) => path.resolve(__dirname, fileName));
	const program: typescript.Program = typescript.createProgram(fixtures, COMPILER_OPTIONS);

	return fixtures.map((fixture) => {
		const source = program.getSourceFile(fixture) as typescript.SourceFile;
		const refused: typescript.Diagnostic[] = [];
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

		const errors: readonly typescript.Diagnostic[] = typescript
			.getPreEmitDiagnostics(program, source)
			.filter((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error);

		return { source, emitted, errors, refused };
	});
};

/**
 * Where a diagnostic points, and its code.
 *
 * @param diagnostic The diagnostic.
 * @returns `line: FULCROnnnn`, the line counted from 1.
 */
const located = (diagnostic: typescript.Diagnostic): string => {
	const { line } = typescript.getLineAndCharacterOfPosition(
		diagnostic.file as typescript.SourceFile,
		diagnostic.start ?? 0,
	);

	return `${String(line + 1)}: FULCRO${String(diagnostic.code)}`;
};

let accepted: Compiled;
let rejected: Compiled;

beforeAll(() => {
	[accepted, rejected] = compile('ownership.sample.ts', 'ownership.rejected.fixture.ts') as [
		Compiled,
		Compiled,
	];
});

describe('ownership rules at compile time', () => {
	it('should compile both fixtures without type errors', () => {
		expect(
			[...accepted.errors, ...rejected.errors].map((error) => {
				return typescript.flattenDiagnosticMessageText(error.messageText, '\n');
			}),
		).toEqual([]);
	});

	it('should refuse nothing a correct program does', () => {
		expect(
			accepted.refused.map((diagnostic) => {
				return `${located(diagnostic)} ${typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
			}),
		).toEqual([]);
	});

	it('should refuse exactly the lines the fixture marks, with their codes', () => {
		const marked: string[] = rejected.source.text.split(/\r?\n/).flatMap((line, index) => {
			const code: string | undefined = /\/\/ (FULCRO\d{4})$/.exec(line)?.[1];

			return code === undefined ? [] : [`${String(index + 1)}: ${code}`];
		});

		expect(marked.length).toBeGreaterThan(10);
		expect(rejected.refused.map(located)).toEqual(marked);
	});

	it('should point at the use, and say where the move was', () => {
		const [first] = rejected.refused;
		const start: number = first?.start ?? -1;

		expect(rejected.source.text.slice(start, start + 'owner'.length)).toBe('owner');

		expect(first?.messageText).toBe(
			"FULCRO7027: move: 'owner' is used after it was moved at line 17; use the owner move returned.",
		);
	});

	it('should name the conflicting borrow and the owner of an ended one', () => {
		const messages: string[] = rejected.refused.map((diagnostic) => String(diagnostic.messageText));

		expect(messages).toContain(
			"FULCRO7028: borrow: the borrow 'reading' is used after borrowMutable(owner) at line 40 ended it.",
		);

		expect(messages).toContain(
			"FULCRO7029: borrow: the borrow 'reading' is used after its owner 'owner' was moved at line 67.",
		);
	});

	it('should rewrite nothing, leaving every call to the runtime', () => {
		expect(accepted.emitted).toContain('borrow(owner)');
		expect(accepted.emitted).toContain('move(owner)');
		expect(rejected.emitted).toContain('borrow(owner); // FULCRO7027');
	});
});
