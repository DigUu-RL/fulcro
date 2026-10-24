import * as path from 'node:path';

import * as typescript from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/src/transformer';

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
	const fileName: string = path.resolve(__dirname, 'counted.virtual.ts').split(path.sep).join('/');

	const options: typescript.CompilerOptions = {
		target: typescript.ScriptTarget.ES2022,
		module: typescript.ModuleKind.ESNext,
		moduleResolution: typescript.ModuleResolutionKind.Bundler,
		strict: true,
		skipLibCheck: true,
	};

	const host: typescript.CompilerHost = typescript.createCompilerHost(options);
	const { getSourceFile, fileExists, readFile } = host;

	host.getSourceFile = (name, ...rest): typescript.SourceFile | undefined => {
		return name === fileName
			? typescript.createSourceFile(name, text, typescript.ScriptTarget.ES2022, true)
			: getSourceFile(name, ...rest);
	};

	host.fileExists = (name): boolean => name === fileName || fileExists(name);
	host.readFile = (name): string | undefined => (name === fileName ? text : readFile(name));

	const program: typescript.Program = typescript.createProgram([fileName], options, host);
	const checker: typescript.TypeChecker = program.getTypeChecker();
	let questions = 0;

	// Built before counting, so the program's own checking is not counted.
	typescript.getPreEmitDiagnostics(program);

	const counting = new Proxy(checker, {
		get: (target, key, receiver) => {
			const value: unknown = Reflect.get(target, key, receiver);

			return typeof value === 'function'
				? (...args: unknown[]): unknown => {
						questions++;

						return (value as (...inner: unknown[]) => unknown).apply(target, args);
					}
				: value;
		},
	});

	const counted: typescript.Program = new Proxy(program, {
		get: (target, key, receiver) => {
			return key === 'getTypeChecker'
				? (): typescript.TypeChecker => counting
				: Reflect.get(target, key, receiver);
		},
	});

	let refused = 0;

	typescript
		.transform(program.getSourceFile(fileName) as typescript.SourceFile, [
			transformer(counted, undefined, { addDiagnostic: () => refused++ }),
		])
		.dispose();

	return { questions, refused };
};

/**
 * A file of `count` units.
 *
 * @param count How many.
 * @returns Its text.
 */
const unitsOf = (count: number): string => {
	return (
		IMPORTS +
		Array.from({ length: count }, (_, index) => UNIT.replace('{n}', String(index))).join('\n')
	);
};

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
		expect(twice.questions - empty.questions).toBe(2 * (once.questions - empty.questions));
	});

	it('should ask nothing of a file that names none of its functions', () => {
		expect(
			questionsFor(
				`${IMPORTS.replace(/borrow, borrowMutable, |move, /g, '')}export const plain = own(() => createManagedStorage(1, 0));`,
			).questions,
		).toBe(0);
	});
});
