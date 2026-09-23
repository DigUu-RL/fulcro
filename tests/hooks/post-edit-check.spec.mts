import { describe, expect, it } from 'vitest';

import { review } from '../../.claude/hooks/post-edit-check.mjs';

/**
 * The one check that runs after an edit.
 *
 * It reports emitted output written beside its source, which `.gitignore`
 * hides and the test runner turns into a broken import hours later. Everything
 * else an edit could be is left alone, on purpose: the value of this hook is
 * that it costs nothing and says nothing almost every time it runs.
 */

describe('emitted output beside its source', () => {
	it('reports a compiled file under a package source tree', () => {
		expect(
			review({ file_path: 'packages/collections/src/index.js' }),
		).not.toBeNull();
		expect(
			review({ file_path: 'packages/reflect/src/name-of/name-of.d.ts' }),
		).not.toBeNull();
		expect(
			review({ file_path: 'packages/parallel/src/pool/pool.mjs' }),
		).not.toBeNull();
	});

	it('reports it whichever way the path is spelled', () => {
		expect(
			review({ file_path: 'packages\\collections\\src\\index.js' }),
		).not.toBeNull();
		expect(
			review({
				file_path:
					'C:/Users/Rodrigo/projects/fulcro/packages/functions/src/try-catch.js',
			}),
		).not.toBeNull();
	});

	it('says nothing about a fixture, which is source that happens to be JavaScript', () => {
		expect(
			review({ file_path: 'packages/parallel/src/pool/fixtures/task.mjs' }),
		).toBeNull();
		expect(
			review({ file_path: 'packages/parallel/src/pool/fixtures/task.js' }),
		).toBeNull();
	});
});

describe('every other edit', () => {
	it('says nothing about TypeScript source', () => {
		expect(
			review({ file_path: 'packages/collections/src/index.ts' }),
		).toBeNull();
		expect(
			review({ file_path: 'packages/collections/src/index.spec.ts' }),
		).toBeNull();
	});

	it('says nothing about JavaScript that lives outside a package source tree', () => {
		expect(review({ file_path: 'eslint.config.mjs' })).toBeNull();
		expect(
			review({ file_path: '.claude/hooks/block-destructive.mjs' }),
		).toBeNull();
		expect(
			review({ file_path: 'packages/collections/dist/index.js' }),
		).toBeNull();
		expect(review({ file_path: 'tests/entrypoints.spec.mts' })).toBeNull();
	});

	it('has nothing to say about an event carrying no path', () => {
		expect(review({})).toBeNull();
		expect(review({ file_path: 7 })).toBeNull();
	});
});
