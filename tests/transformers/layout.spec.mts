import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Layout suite.
 *
 * `@fulcro/types` declares a layout on each numeric type and `@fulcro/reflect`
 * reads it, and neither package imports the other: the `'~layout'` shape is
 * the whole agreement. Each package's own suites prove its half against a
 * local copy of that shape. This proves the halves meet — the declarations one
 * package publishes, read by the transformer the other publishes, through
 * `node_modules`, as a consumer's compiler would.
 *
 * It is also the table of layouts, asserted where a consumer would observe it.
 */

/** Resolves the built packages the way a consumer's compiler would. */
const require = createRequire(import.meta.url);

/** Fixture fed to the compiler. */
const FIXTURE = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'layout.sample.ts',
);

/** JavaScript emitted for the fixture. */
let emitted = '';

beforeAll(() => {
	const reflect = require('@fulcro/reflect/transformer').default as (
		program: ts.Program,
	) => ts.TransformerFactory<ts.SourceFile>;

	const program: ts.Program = ts.createProgram([FIXTURE], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	const errors: readonly ts.Diagnostic[] = ts
		.getPreEmitDiagnostics(program, program.getSourceFile(FIXTURE))
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

	program.emit(
		program.getSourceFile(FIXTURE),
		(fileName, text) => {
			if (fileName.endsWith('.js')) emitted = text;
		},
		undefined,
		false,
		{ before: [reflect(program)] },
	);
});

describe('the layout of @fulcro/types, read by @fulcro/reflect', () => {
	it.each([
		['signed8', 1],
		['signed16', 2],
		['signed32', 4],
		['signed64', 8],
		['signed128', 16],
		['unsigned8', 1],
		['unsigned128', 16],
		['half', 2],
		['single', 4],
		['double', 8],
		['decimalSize', 16],
		['decimalAlignment', 16],
	])('should emit %s as %i', (binding, bytes) => {
		expect(emitted).toContain(`export const ${binding} = ${bytes};`);
	});

	it('should leave no call to either utility behind', () => {
		expect(emitted).not.toMatch(/sizeOf\(|alignOf\(/);
	});

	it('should import nothing of @fulcro/types at runtime', () => {
		// `import type` is erased, which is the promise to a consumer who wants
		// only the types: no module of the package is loaded.
		expect(emitted).toMatch(/from ['"]@fulcro\/reflect['"]/);
		expect(emitted).not.toMatch(
			/from ['"]@fulcro\/types['"]|import\(['"]@fulcro\/types['"]\)/,
		);
	});
});
