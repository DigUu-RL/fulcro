import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Performance suite for the ownership rules.
 *
 * Counted, never timed (`docs/testing.md`): what is counted is the questions
 * the rules ask the type checker, which is where compiling spends its time. A
 * file twice as long asks twice as many — each call is resolved once, however
 * often the walk meets it — and a file that never names a function of this
 * package asks none.
 */

/** A function taking, lending and moving an owner, legally. */
const UNIT = [
	'export const unit{n} = (): number => {',
	'\tconst owner = own(() => createManagedStorage(4, 0));',
	'\tconst reading = borrow(owner);',
	'\tconst total = reading.get(0);',
	'\tfor (let index = 0; index < 3; index++) borrowMutable(owner).set(index, total);',
	'\treturn borrow(move(owner)).get(0);',
	'};',
].join('\n');

/** What every file starts with. */
const IMPORTS =
	"import { borrow, borrowMutable, createManagedStorage, move, own } from '@fulcro/memory';\n";

/**
 * Compiles a file written in memory, beside this suite so that
 * `@fulcro/memory` resolves as it does for the fixtures, and counts what the
 * transformer asks the checker.
 *
 * @param text The file.
 * @returns How many questions, and how many refusals.
 */
const questionsFor = (text: string): { questions: number; refused: number } => {
	const fileName: string = path
		.resolve(__dirname, 'counted.virtual.ts')
		.split(path.sep)
		.join('/');
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		skipLibCheck: true,
	};
	const host: ts.CompilerHost = ts.createCompilerHost(options);
	const { getSourceFile, fileExists, readFile } = host;

	host.getSourceFile = (name, ...rest) =>
		name === fileName
			? ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true)
			: getSourceFile(name, ...rest);
	host.fileExists = (name) => name === fileName || fileExists(name);
	host.readFile = (name) => (name === fileName ? text : readFile(name));

	const program: ts.Program = ts.createProgram([fileName], options, host);
	const checker: ts.TypeChecker = program.getTypeChecker();
	let questions = 0;

	// Built before counting, so the program's own checking is not counted.
	ts.getPreEmitDiagnostics(program);

	const counting = new Proxy(checker, {
		get: (target, key, receiver) => {
			const value: unknown = Reflect.get(target, key, receiver);

			return typeof value === 'function'
				? (...args: unknown[]) => {
						questions++;

						return (value as (...inner: unknown[]) => unknown).apply(
							target,
							args,
						);
					}
				: value;
		},
	});
	const counted: ts.Program = new Proxy(program, {
		get: (target, key, receiver) =>
			key === 'getTypeChecker'
				? () => counting
				: Reflect.get(target, key, receiver),
	});
	let refused = 0;

	ts.transform(program.getSourceFile(fileName) as ts.SourceFile, [
		transformer(counted, undefined, { addDiagnostic: () => refused++ }),
	]).dispose();

	return { questions, refused };
};

/**
 * A file of `count` units.
 *
 * @param count How many.
 * @returns Its text.
 */
const unitsOf = (count: number): string =>
	IMPORTS +
	Array.from({ length: count }, (_, index) =>
		UNIT.replace('{n}', String(index)),
	).join('\n');

/** What the transformer asked of files of none, fifty and a hundred units. */
let empty: { questions: number; refused: number };
let once: { questions: number; refused: number };
let twice: { questions: number; refused: number };

// Each one builds and checks a whole program — the costly part, and not what
// is counted — so it happens under the hook's generous ceiling.
beforeAll(() => {
	empty = questionsFor(unitsOf(0));
	once = questionsFor(unitsOf(50));
	twice = questionsFor(unitsOf(100));
});

describe('ownership rules, counted', () => {
	it('should ask the checker twice as much for a file twice as long', () => {
		expect(once.refused + twice.refused).toBe(0);
		expect(once.questions).toBeGreaterThan(empty.questions);
		expect(twice.questions - empty.questions).toBe(
			2 * (once.questions - empty.questions),
		);
	});

	it('should ask nothing of a file that names none of its functions', () => {
		expect(
			questionsFor(
				`${IMPORTS.replace(/borrow, borrowMutable, |move, /g, '')}export const plain = own(() => createManagedStorage(1, 0));`,
			).questions,
		).toBe(0);
	});
});
