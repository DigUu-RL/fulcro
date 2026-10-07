import * as path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { packageNameOf } from '@/shared';

import { createWorkspace } from './workspace';

/**
 * Behaviour suite for `packageNameOf`.
 *
 * The package a declaration belongs to is the `name` of the nearest
 * `package.json` above it — the same answer Node gives when it resolves a
 * bare specifier, which is what a consumer's import goes through.
 */

let workspace: { root: string; remove: () => void };

beforeAll(() => {
	workspace = createWorkspace({
		'package.json': JSON.stringify({ name: 'consumer' }),
		'src/move/index.ts': '',
		'node_modules/@scope/library/package.json': JSON.stringify({
			name: '@scope/library',
		}),
		'node_modules/@scope/library/dist/move/index.d.ts': '',
		'node_modules/nameless/package.json': JSON.stringify({ private: true }),
		'node_modules/nameless/index.d.ts': '',
	});
});

afterAll(() => {
	workspace.remove();
});

/**
 * A file of the workspace.
 *
 * @param relative Path below the root, `/`-separated.
 * @returns Its absolute path, in the platform's spelling.
 */
const at = (relative: string): string =>
	path.join(workspace.root, ...relative.split('/'));

describe('packageNameOf', () => {
	it('should name the package of a file deep below its manifest', () => {
		expect(
			packageNameOf(at('node_modules/@scope/library/dist/move/index.d.ts')),
		).toBe('@scope/library');
	});

	it("should tell a consumer's own file of the same layout apart", () => {
		expect(packageNameOf(at('src/move/index.ts'))).toBe('consumer');
	});

	it('should stop at the nearest manifest, even one without a name', () => {
		expect(packageNameOf(at('node_modules/nameless/index.d.ts'))).toBeNull();
	});

	it('should accept the compiler spelling, with forward slashes', () => {
		expect(
			packageNameOf(
				at('node_modules/@scope/library/dist/move/index.d.ts')
					.split(path.sep)
					.join('/'),
			),
		).toBe('@scope/library');
	});
});
