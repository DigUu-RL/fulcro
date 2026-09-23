import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite for `alignOf`.
 *
 * Compiles the layout fixture with the transformer applied and reads what the
 * `alignOf` calls became. The refusal of a type with no layout is asserted by
 * the `sizeOf` suite, over one fixture holding both utilities' rejected calls.
 */

/** Root of the package, which the reported declaration paths are relative to. */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** JavaScript emitted for the fixture. */
let emitted = '';

beforeAll(() => {
	const fixture: string = path.resolve(__dirname, 'layout.sample.ts');
	const program: ts.Program = ts.createProgram([fixture], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Node10,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	program.emit(
		program.getSourceFile(fixture),
		(name, text) => {
			if (name.endsWith('.js')) emitted = text;
		},
		undefined,
		false,
		{ before: [transformer(program, { projectRoot: PROJECT_ROOT })] },
	);
});

describe('alignOf at compile time', () => {
	it('should replace each call with the alignment the type declares', () => {
		expect(emitted).toContain('export const halfAlignment = 2;');
		expect(emitted).toContain('export const declaredAlignment = 4;');
	});

	it('should leave no resolvable call behind', () => {
		expect(emitted).not.toContain('alignOf(');
	});
});
