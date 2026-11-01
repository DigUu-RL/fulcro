import * as path from 'node:path';

import * as typescript from 'typescript';
import { afterEach, assert, beforeAll, describe, expect, it, vi } from 'vitest';

import { type CompiledEscape, compileEscape } from '@/src/tests/transformer/compileEscape';
import { watchBuffers } from '@/src/tests/watchBuffers';
import transformer from '@/src/transformer';

/**
 * Performance suite for the escape analysis.
 *
 * Counted, never timed (`docs/testing.md`). What the rewrite exists for is
 * the buffers the engine is no longer asked for, so the fixture runs compiled
 * both ways and every `ArrayBuffer` it makes is counted. What the analysis
 * costs is counted too: how often it asks the checker, which must grow with
 * the uses it examines and not with the size of the block around them.
 */

/** Rounds of a loop: enough that a buffer per round stands out from a constant. */
const ROUNDS = 10_000;

/** Candidates in one block, for the cost of the analysis. */
const CANDIDATES = 100;

/** Uses of each candidate. */
const USES = 4;

/** The perRound function of the fixture. */
type PerRound = (rounds: number) => number;

afterEach(() => {
	vi.unstubAllGlobals();
});

/**
 * Runs the fixture's loop, counting the buffers it makes.
 *
 * @param transformed Whether the transformer is applied.
 * @param rounds How many rounds.
 * @returns How many buffers were made.
 */
const buffersFor = (transformed: boolean, rounds: number): number => {
	const perRound = compiled.run(transformed).perRound as PerRound;
	const buffers = watchBuffers();

	perRound(rounds);

	const made: number = buffers.made;

	vi.unstubAllGlobals();

	return made;
};

/**
 * Builds a block holding many candidates, each used a few times, and counts
 * the questions the transformer puts to the checker while rewriting it.
 *
 * The file never touches the disk: the compiler host serves it from memory,
 * beside the other fixtures so `@fulcro/memory` resolves as it does for them.
 *
 * @param candidates How many storages the block declares.
 * @returns How many symbols were asked for, and how many frames were opened.
 */
const analyze = (candidates: number): { questions: number; frames: number } => {
	const fileName: string = path.resolve(__dirname, 'escape.generated.ts');
	const names: string[] = Array.from({ length: candidates }, (_, index) => `local${String(index)}`);

	const text: string = [
		"import { allocate, createManagedAllocator } from '@fulcro/memory';",
		"import { SignedInteger } from '@fulcro/types';",
		'const Integer = SignedInteger(32);',
		'const managed = createManagedAllocator();',
		'export const run = (): number => {',
		...names.map((name) => `\tconst ${name} = allocate(Integer, 1, managed);`),
		`\treturn ${names.map((name) => Array.from({ length: USES }, () => `${name}.length`).join(' + ')).join(' + ')};`,
		'};',
		'',
	].join('\n');

	const options: typescript.CompilerOptions = {
		target: typescript.ScriptTarget.ES2022,
		module: typescript.ModuleKind.ESNext,
		moduleResolution: typescript.ModuleResolutionKind.Bundler,
		strict: true,
		skipLibCheck: true,
	};

	const host: typescript.CompilerHost = typescript.createCompilerHost(options);
	const written = typescript.sys.resolvePath(fileName);

	const served: typescript.CompilerHost = {
		...host,
		fileExists: (name) => typescript.sys.resolvePath(name) === written || host.fileExists(name),
		readFile: (name) => (typescript.sys.resolvePath(name) === written ? text : host.readFile(name)),
		getSourceFile: (name, version, ...rest) => {
			return typescript.sys.resolvePath(name) === written
				? typescript.createSourceFile(name, text, version, true)
				: host.getSourceFile(name, version, ...rest);
		},
	};

	const program: typescript.Program = typescript.createProgram([fileName], options, served);
	const checker: typescript.TypeChecker = program.getTypeChecker();
	let questions = 0;

	const counting: typescript.TypeChecker = new Proxy(checker, {
		get: (target, key, receiver): unknown => {
			if (key === 'getSymbolAtLocation') {
				return (node: typescript.Node): typescript.Symbol | undefined => {
					questions++;

					return target.getSymbolAtLocation(node);
				};
			}

			return Reflect.get(target, key, receiver) as unknown;
		},
	});

	const counted: typescript.Program = new Proxy(program, {
		get: (target, key, receiver): unknown => {
			return key === 'getTypeChecker'
				? (): typescript.TypeChecker => counting
				: (Reflect.get(target, key, receiver) as unknown);
		},
	});

	const source: typescript.SourceFile | undefined = program.getSourceFile(fileName);

	assert.isDefined(source);

	const result = typescript.transform(source, [transformer(counted)]);
	const [rewritten] = result.transformed;

	assert.isDefined(rewritten);

	const printed: string = typescript.createPrinter().printFile(rewritten);

	result.dispose();

	return { questions, frames: printed.match(/\.enter\(\)/g)?.length ?? 0 };
};

let compiled: CompiledEscape;

/** The analysis of a block of candidates, and of one twice its size. */
let single: { questions: number; frames: number };
let double: { questions: number; frames: number };

// Each analysis builds and checks a program — the costly part, and not what is
// counted — so they run under the hook's generous ceiling rather than a test's.
beforeAll(() => {
	compiled = compileEscape();
	single = analyze(CANDIDATES);
	double = analyze(CANDIDATES * 2);
});

describe('escape analysis, counted', () => {
	it('should make one buffer per round as written', () => {
		expect(buffersFor(false, ROUNDS)).toBe(ROUNDS);
	});

	it('should make two buffers for every round once rewritten: the first round, and the region', () => {
		expect(buffersFor(true, ROUNDS)).toBe(2);
	});

	it('should make no buffer at all once the region is sized', () => {
		const perRound = compiled.run(true).perRound as PerRound;

		perRound(1);

		const buffers = watchBuffers();

		perRound(ROUNDS);

		expect(buffers.made).toBe(0);
	});

	it('should ask the checker in proportion to the uses, however many candidates share the block', () => {
		expect([single.frames, double.frames]).toEqual([CANDIDATES, CANDIDATES * 2]);
		expect(double.questions).toBe(single.questions * 2);
	});
});
