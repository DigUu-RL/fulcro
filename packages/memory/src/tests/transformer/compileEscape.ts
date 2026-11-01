import * as path from 'node:path';
import { runInThisContext } from 'node:vm';

import * as types from '@fulcro/types';
import * as typescript from 'typescript';
import { assert } from 'vitest';

import * as memory from '@/src/index';
import transformer from '@/src/transformer';

/**
 * Compiles the escape fixture, and runs what it compiles to.
 *
 * The fixture imports `@fulcro/memory` by name, so the analysis follows every
 * call across the package boundary — through the built declarations — as it
 * does in a consumer's project. Running it is what shows that a rewritten
 * program computes what the written one does: the emitted modules are
 * evaluated here, with `@fulcro/memory` handed this package's own source, so
 * the allocations they make are the ones a suite can count.
 */

/** The fixture, and the module it imports its allocator from. */
const FIXTURES = ['escape.sample.ts', 'escape.allocator.ts'].map((name) => {
	return path.resolve(__dirname, name);
});

/** Options the fixtures compile with: CommonJS, so the output can be evaluated as a function. */
const COMPILER_OPTIONS: typescript.CompilerOptions = {
	target: typescript.ScriptTarget.ES2022,
	module: typescript.ModuleKind.CommonJS,
	// `Node10`, the resolution CommonJS allows: the fixture imports only the
	// main entry of each package, which it finds through the `types` field.
	moduleResolution: typescript.ModuleResolutionKind.Node10,
	strict: true,
	noEmitOnError: false,
	skipLibCheck: true,
};

/** The fixture as compiled, once. */
export interface CompiledEscape {
	/** The fixture as written. */
	readonly source: typescript.SourceFile;

	/** The fixture after the transformer, printed as TypeScript. */
	readonly rewritten: string;

	/** Errors the compiler found in either file. */
	readonly errors: readonly string[];

	/**
	 * Runs the emitted fixture.
	 *
	 * @param transformed Whether the transformer is applied.
	 * @returns What the fixture exports.
	 */
	readonly run: (transformed: boolean) => Record<string, unknown>;
}

/**
 * Evaluates one emitted CommonJS module.
 *
 * @param code The module.
 * @param modules What each specifier it requires resolves to.
 * @returns Its exports.
 */
const evaluate = (
	code: string,
	modules: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
	const exports: Record<string, unknown> = {};

	const body = runInThisContext(`(function (require, exports) {\n${code}\n})`) as (
		require: (specifier: string) => unknown,
		exports: Record<string, unknown>,
	) => void;

	body((specifier) => {
		const resolved: unknown = modules[specifier];

		if (resolved === undefined) {
			throw new Error(`The fixture requires ${specifier}, which is not provided.`);
		}

		return resolved;
	}, exports);

	return exports;
};

/**
 * Compiles the fixtures in one program.
 *
 * @returns The compiled fixture.
 */
export const compileEscape = (): CompiledEscape => {
	const program: typescript.Program = typescript.createProgram(FIXTURES, COMPILER_OPTIONS);
	const [sample, allocator] = FIXTURES.map((fixture) => program.getSourceFile(fixture));

	assert.isDefined(sample);
	assert.isDefined(allocator);

	const errors: string[] = [sample, allocator].flatMap((file) => {
		return typescript
			.getPreEmitDiagnostics(program, file)
			.filter((diagnostic) => diagnostic.category === typescript.DiagnosticCategory.Error)
			.map((diagnostic) => typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
	});

	const result = typescript.transform(sample, [transformer(program)]);
	const [transformedSample] = result.transformed;

	assert.isDefined(transformedSample);

	const rewritten: string = typescript.createPrinter().printFile(transformedSample);

	result.dispose();

	const emit = (file: typescript.SourceFile, transformed: boolean): string => {
		let emitted = '';

		program.emit(
			file,
			(name, text) => {
				if (name.endsWith('.js')) emitted = text;
			},
			undefined,
			false,
			transformed ? { before: [transformer(program)] } : undefined,
		);

		return emitted;
	};

	const emitted = {
		sample: [emit(sample, false), emit(sample, true)],
		allocator: [emit(allocator, false), emit(allocator, true)],
	} as const;

	const run = (transformed: boolean): Record<string, unknown> => {
		const index: 0 | 1 = transformed ? 1 : 0;
		const modules = { '@fulcro/memory': memory, '@fulcro/types': types };

		return evaluate(emitted.sample[index], {
			...modules,
			'./escape.allocator': evaluate(emitted.allocator[index], modules),
		});
	};

	return { source: sample, rewritten, errors, run };
};
