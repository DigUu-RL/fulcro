import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The mathematics types and `constantOf` across the package boundary.
 *
 * `@fulcro/types` declares the layout of a matrix, a vector, a complex number,
 * a fraction and a quaternion in its types; the `@fulcro/reflect` transformer
 * reads them from the built declarations, as a consumer's compiler does. The
 * layouts it emits are compared with what the runtime computes in the same
 * run, and a constant that reaches into another package is shown to be
 * refused, loudly, rather than quietly left to the runtime.
 *
 * Both plugins are applied, as a consumer using both libraries applies them.
 */

/** Resolves the built packages the way a consumer's compiler would. */
const require = createRequire(import.meta.url);

/** Directory of this suite and its fixtures. */
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A transformer as its entry point exports it. */
type TransformerEntry = (
	program: ts.Program,
	options?: object,
	extras?: { addDiagnostic?: (diagnostic: ts.Diagnostic) => unknown },
) => ts.TransformerFactory<ts.SourceFile>;

/** What compiling one fixture produced. */
interface Compiled {
	readonly emitted: string;
	readonly refused: readonly ts.Diagnostic[];
	readonly exports: Record<string, unknown>;
}

/**
 * Compiles a fixture with both plugins, and runs what came out.
 *
 * @param fileName Fixture beside this suite.
 * @returns The emitted JavaScript, what the transformers refused, and the
 * module's exports once run.
 */
const compile = (fileName: string): Compiled => {
	const fixture: string = path.resolve(HERE, fileName);
	const reflect = require('@fulcro/reflect/transformer')
		.default as TransformerEntry;
	const collections = require('@fulcro/collections/transformer')
		.default as TransformerEntry;
	const program: ts.Program = ts.createProgram([fixture], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});
	const errors: readonly ts.Diagnostic[] = ts
		.getPreEmitDiagnostics(program, program.getSourceFile(fixture))
		.filter(
			(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
		);

	if (errors.length > 0) {
		throw new Error(
			errors
				.map((error) =>
					ts.flattenDiagnosticMessageText(error.messageText, '\n'),
				)
				.join('\n'),
		);
	}

	const refused: ts.Diagnostic[] = [];
	const extras = {
		addDiagnostic: (diagnostic: ts.Diagnostic) => refused.push(diagnostic),
	};
	let emitted = '';

	program.emit(
		program.getSourceFile(fixture),
		(name, text) => {
			if (name.endsWith('.js')) emitted = text;
		},
		undefined,
		false,
		{
			before: [reflect(program, {}, extras), collections(program, {}, extras)],
		},
	);

	const module = { exports: {} as Record<string, unknown> };

	if (refused.length === 0) {
		new Function(
			'require',
			'module',
			'exports',
			ts.transpileModule(emitted, {
				compilerOptions: {
					target: ts.ScriptTarget.ES2022,
					module: ts.ModuleKind.CommonJS,
				},
			}).outputText,
		)(require, module, module.exports);
	}

	return { emitted, refused, exports: module.exports };
};

/** The fixture whose every call resolves. */
let accepted: Compiled;

/** The fixture whose constant reaches into another package. */
let rejected: Compiled;

beforeAll(() => {
	accepted = compile('mathematics.sample.ts');
	rejected = compile('mathematics.rejected.sample.ts');
});

describe('the mathematics types and constantOf across the package boundary', () => {
	it('should resolve every call', () => {
		expect(accepted.refused).toEqual([]);
		expect(accepted.emitted).not.toMatch(/\b(sizeOf|layoutOf|constantOf)\(/);
	});

	it('should read the size of each type from its built declarations', () => {
		expect(accepted.exports).toMatchObject({
			transformSize: 48,
			pointSize: 24,
			complexSize: 16,
			fractionSize: 4,
			quaternionSize: 64,
		});
	});

	it('should place a matrix among the fields of a struct as the struct does', () => {
		const { Holder, holderLayout } = accepted.exports as {
			Holder: { layout: unknown };
			holderLayout: unknown;
		};

		expect(holderLayout).toEqual(Holder.layout);
		expect(holderLayout).toMatchObject({
			size: 52,
			alignment: 4,
			fields: { transform: { offset: 0, size: 48, alignment: 4 } },
		});
	});

	it('should evaluate a constant beside them', () => {
		expect(accepted.exports.squares).toEqual([0, 1, 4, 9]);
		expect(Object.isFrozen(accepted.exports.squares)).toBe(true);
	});

	it('should refuse a constant that calls into another package, at its call', () => {
		expect(rejected.refused).toHaveLength(1);

		const [refusal] = rejected.refused;
		const file = refusal.file as ts.SourceFile;
		const { line } = file.getLineAndCharacterOfPosition(refusal.start ?? 0);

		expect(String(refusal.messageText)).toContain(
			"'Matrix' is only declared in a declaration file, whose value the compiler cannot see",
		);
		expect(file.text.split(/\r?\n/)[line]).toContain('constantOf(');
	});
});
