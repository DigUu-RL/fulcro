import { describe, expect, it } from 'vitest';

import { matchedBy, matches } from '../../tools/claude/glob.mjs';

/**
 * The matcher the rule fixtures are decided with.
 *
 * It answers one question — would this rule be loaded for this file — and the
 * cases below are the ones a scope is written wrong in: an extension the tree
 * does not use, a wildcard that was meant to cross directories and does not,
 * and a package name that a neighbouring package's path happens to start with.
 */

describe('a wildcard inside one segment', () => {
	it('matches within the segment and stops at the separator', () => {
		expect(
			matches('packages/*/src/index.ts', 'packages/reflect/src/index.ts'),
		).toBe(true);

		expect(
			matches('packages/*/src/index.ts', 'packages/reflect/src/pool/index.ts'),
		).toBe(false);
	});

	it('separates one extension from another', () => {
		expect(matches('src/*.mts', 'src/index.mts')).toBe(true);
		expect(matches('src/*.mts', 'src/index.ts')).toBe(false);
	});

	it('takes a single character for a question mark', () => {
		expect(matches('src/inde?.ts', 'src/index.ts')).toBe(true);
		expect(matches('src/inde?.ts', 'src/index.mts')).toBe(false);
	});
});

describe('a wildcard across segments', () => {
	it('matches any depth below the directory, including none', () => {
		const glob = 'packages/collections/src/**/*.ts';

		expect(matches(glob, 'packages/collections/src/index.ts')).toBe(true);
		expect(
			matches(glob, 'packages/collections/src/collections/async/index.ts'),
		).toBe(true);
	});

	it('does not escape the directory it is anchored in', () => {
		const glob = 'packages/collections/src/**/*.ts';

		expect(matches(glob, 'packages/parallel/src/index.ts')).toBe(false);
		expect(matches(glob, 'tests/entrypoints.spec.mts')).toBe(false);
	});

	it('takes everything below it when it ends the glob', () => {
		expect(matches('tests/**', 'tests/hooks/hook.spec.mts')).toBe(true);
		expect(matches('tests/**', 'tools/claude/tree.mjs')).toBe(false);
	});
});

describe('what is not glob syntax', () => {
	it('reads a dot as a dot rather than as any character', () => {
		expect(matches('src/index.ts', 'src/indexXts')).toBe(false);
	});

	it('anchors both ends, so a longer name is not a match', () => {
		expect(
			matches('packages/collections/**', 'packages/collections-2/a.ts'),
		).toBe(false);

		expect(matches('src/*.ts', 'other/src/index.ts')).toBe(false);
	});
});

describe('a set of globs', () => {
	it('matches when any one of them does, and reports none as no match', () => {
		const globs = [
			'packages/*/src/transformer/**/*.ts',
			'tests/transformers/**',
		];

		expect(matchedBy(globs, 'packages/reflect/src/transformer/index.ts')).toBe(
			true,
		);
		expect(matchedBy(globs, 'tests/transformers/coexistence.sample.ts')).toBe(
			true,
		);
		expect(matchedBy(globs, 'packages/reflect/src/index.ts')).toBe(false);
		expect(matchedBy([], 'packages/reflect/src/index.ts')).toBe(false);
	});
});
