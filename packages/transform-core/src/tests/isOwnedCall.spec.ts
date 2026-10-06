import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type CallTarget, isOwnedCall } from '@/shared';

import { createWorkspace } from './workspace';

/**
 * Behaviour suite for `isOwnedCall`, on what `packageName` adds to it.
 *
 * A library laid out as `dist/<utility>/index` matches a consumer's own
 * `src/<utility>/index` on the module segment alone. The fixture holds both: a
 * `move` imported from the library and a `move` the consumer wrote, in a
 * folder of the same name.
 */

let workspace: { root: string; remove: () => void };
let program: typescript.Program;

beforeAll(() => {
	workspace = createWorkspace({
		'package.json': JSON.stringify({ name: 'consumer' }),
		'node_modules/library/package.json': JSON.stringify({
			name: 'library',
			types: 'dist/index.d.ts',
		}),
		'node_modules/library/dist/index.d.ts':
			"export { move } from './move/index';\n",
		'node_modules/library/dist/move/index.d.ts':
			'export declare const move: (value: unknown) => unknown;\n',
		'src/move/index.ts':
			'export const move = (value: unknown): unknown => value;\n',
		'src/fromLibrary.ts': "import { move } from 'library';\nmove(1);\n",
		'src/fromConsumer.ts': "import { move } from './move/index';\nmove(2);\n",
	});

	program = typescript.createProgram(
		['fromLibrary.ts', 'fromConsumer.ts'].map((name) =>
			path.join(workspace.root, 'src', name),
		),
		{
			module: typescript.ModuleKind.ESNext,
			moduleResolution: typescript.ModuleResolutionKind.Bundler,
			strict: true,
			noEmit: true,
		},
	);
});

afterAll(() => {
	workspace.remove();
});

/**
 * The one call a fixture makes.
 *
 * @param name File under `src`.
 * @returns Its call expression.
 */
const callIn = (name: string): typescript.CallExpression => {
	const source = program.getSourceFile(
		path.join(workspace.root, 'src', name).split(path.sep).join('/'),
	) as typescript.SourceFile;
	const statement = source.statements[1] as typescript.ExpressionStatement;

	return statement.expression as typescript.CallExpression;
};

/** The library's `move`, described without its package. */
const BY_SEGMENT: CallTarget = {
	functionName: 'move',
	moduleSegment: path.join('move', 'index'),
};

/** The same, required to come from the library. */
const BY_PACKAGE: CallTarget = { ...BY_SEGMENT, packageName: 'library' };

describe('isOwnedCall with a package name', () => {
	it("should claim the consumer's own move on the segment alone", () => {
		// The false claim the package name exists to prevent.
		expect(
			isOwnedCall(
				callIn('fromConsumer.ts'),
				program.getTypeChecker(),
				BY_SEGMENT,
			),
		).toBe(true);
	});

	it('should claim the library call when the package matches', () => {
		expect(
			isOwnedCall(
				callIn('fromLibrary.ts'),
				program.getTypeChecker(),
				BY_PACKAGE,
			),
		).toBe(true);
	});

	it("should leave the consumer's own move alone when the package differs", () => {
		expect(
			isOwnedCall(
				callIn('fromConsumer.ts'),
				program.getTypeChecker(),
				BY_PACKAGE,
			),
		).toBe(false);
	});
});
