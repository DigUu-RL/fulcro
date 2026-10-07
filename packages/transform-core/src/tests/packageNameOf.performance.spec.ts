import * as path from 'node:path';

import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { packageNameOf } from '@/shared';

import { createWorkspace } from './workspace';

/**
 * Performance suite for `packageNameOf`.
 *
 * Counted, never timed (`docs/testing.md`): what is counted is the questions
 * asked of the file system. A program holds thousands of declarations, every
 * owned call asks about one, and the walk up to a manifest is the expensive
 * part — so it happens once per directory, however many files share it.
 */

/** Files in one directory: enough that a per-file walk would stand out. */
const FILES = 1_000;

let workspace: { root: string; remove: () => void };

beforeAll(() => {
	workspace = createWorkspace({
		'package.json': JSON.stringify({ name: 'library' }),
		'dist/deep/er/still/index.d.ts': '',
	});
});

afterAll(() => {
	workspace.remove();
	vi.restoreAllMocks();
});

describe('packageNameOf, counted', () => {
	it('should look at each directory once, however many files ask', () => {
		const exists = vi.spyOn(typescript.sys, 'fileExists');
		const read = vi.spyOn(typescript.sys, 'readFile');
		const directory: string = path.join(
			workspace.root,
			'dist',
			'deep',
			'er',
			'still',
		);

		for (let index = 0; index < FILES; index++) {
			expect(packageNameOf(path.join(directory, `file${index}.d.ts`))).toBe(
				'library',
			);
		}

		// Five directories from `still` up to the root, each looked at once;
		// the root's manifest is read once.
		expect(exists).toHaveBeenCalledTimes(5);
		expect(read).toHaveBeenCalledTimes(1);
	});
});
