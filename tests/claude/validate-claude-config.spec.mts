import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { validateConfig } from '../../tools/claude/validate-claude-config.mjs';

import { discardTrees, type Tree, tree } from './fixture.mjs';

/**
 * The structural validation of the settings, the hooks and the rules.
 *
 * Read the same way as the skills suite next door: a tree on disk, and the
 * rule identifiers it produces.
 */

afterEach(discardTrees);

/**
 * The rules that fired at a given level.
 *
 * @param root The fixture root.
 * @param level Which half of the report to read.
 * @returns The rule identifiers, in the order they were reported.
 */
const rules = (root: string, level: 'error' | 'warning' = 'error'): string[] =>
	validateConfig(root)
		.filter((finding) => finding.level === level)
		.map((finding) => finding.rule);

/**
 * A settings document wiring the named hooks to `PreToolUse`.
 *
 * @param scripts The hook files, as the command line names them.
 * @param deny The permission entries.
 * @returns The file contents.
 */
const settings = (scripts: string[], deny: string[] = []): string =>
	`${JSON.stringify(
		{
			permissions: { deny },
			hooks: {
				PreToolUse: [
					{
						matcher: 'Bash|PowerShell',
						hooks: scripts.map((script) => ({
							type: 'command',
							command: `node ${script}`,
						})),
					},
				],
			},
		},
		null,
		'\t',
	)}\n`;

/**
 * A repository with a contract, a rules index and nothing else to say.
 *
 * @returns The tree.
 */
const configured = (): Tree => {
	const fixture = tree();

	fixture.write('.claude/CLAUDE.md', '# Contract\n\nNothing yet.\n');
	fixture.write('.claude/rules/README.md', '# Rules\n\nNone yet.\n');

	return fixture;
};

/**
 * Writes a guard and, unless told otherwise, the suite that proves it.
 *
 * @param fixture The tree.
 * @param name The file name, without the extension.
 * @param options `tested` writes the suite; `guard` exports `review`.
 */
const hook = (
	fixture: Tree,
	name: string,
	options: { tested?: boolean; guard?: boolean } = {},
): void => {
	const { tested = true, guard = true } = options;

	fixture.write(
		`.claude/hooks/${name}.mjs`,
		guard
			? 'export const review = () => null;\n'
			: 'export const runs = () => true;\n',
	);

	if (!tested) return;

	fixture.write(`tests/hooks/${name}.spec.mts`, 'export {};\n');
};

describe('the settings', () => {
	it('accepts a tree whose hooks are all there, wired and covered', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(
				['.claude/hooks/protect-publish.mjs'],
				['Bash(git push:*)', 'PowerShell(git push:*)'],
			),
		);

		expect(rules(fixture.root)).toEqual([]);
		expect(rules(fixture.root, 'warning')).toEqual([]);
	});

	it('reports a hook wired to a file that is not there', () => {
		const fixture = configured();

		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);

		expect(rules(fixture.root)).toEqual(['hook-missing']);
	});

	it('reports a guard nothing runs', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		hook(fixture, 'block-destructive');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);

		expect(rules(fixture.root)).toEqual(['hook-unwired']);
	});

	it('reports a guard with no suite behind it', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish', { tested: false });
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);

		expect(rules(fixture.root)).toEqual(['hook-untested']);
	});

	it('warns about a module that is neither a guard nor a known library', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		hook(fixture, 'helpers', { guard: false, tested: false });
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);

		expect(rules(fixture.root, 'warning')).toEqual(['hook-unused']);
	});

	it('reports settings that are not JSON, and settings that are not there', () => {
		const broken = configured();

		broken.write('.claude/settings.json', '{ "hooks": }\n');
		expect(rules(broken.root)).toEqual(['settings-unreadable']);

		const absent = configured();

		expect(rules(absent.root)).toEqual(['settings-missing']);
	});
});

describe('the permission list beside the hooks', () => {
	it('reports an entry naming a tool no hook matches', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs'], ['Write(dist/**)']),
		);

		expect(rules(fixture.root)).toEqual(['permission-unmatched']);
	});

	it('reports an entry that is not a permission at all', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs'], ['git push']),
		);

		expect(rules(fixture.root)).toEqual(['permission-shape']);
	});

	it('warns when a command is denied in one shell and not the other', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs'], ['Bash(npm publish:*)']),
		);

		expect(rules(fixture.root, 'warning')).toEqual(['permission-asymmetric']);
	});
});

describe('the rules', () => {
	it('reports one the index does not list', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);
		fixture.write(
			'.claude/rules/build-output.md',
			'# Build output\n\n**Scope:** `packages/*`\n',
		);

		expect(rules(fixture.root)).toEqual(['rule-unlisted']);
	});

	it('warns about one that never says where it applies', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);
		fixture.write(
			'.claude/rules/README.md',
			'# Rules\n\n- `build-output.md`\n',
		);
		fixture.write(
			'.claude/rules/build-output.md',
			'# Build output\n\nSomewhere.\n',
		);

		expect(rules(fixture.root, 'warning')).toEqual(['rule-scope']);
	});

	it('reports a contract that is not there', () => {
		const fixture = tree();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);

		expect(rules(fixture.root)).toContain('contract-missing');
	});
});

describe('what the contract and the rules name', () => {
	it('reports a file that has been renamed out from under them', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);
		fixture.write(
			'.claude/CLAUDE.md',
			'# Contract\n\nThe standard is `docs/testing.md`.\n',
		);

		expect(rules(fixture.root)).toEqual(['reference-missing']);
	});

	it('leaves alone a path the repository deliberately keeps out of itself', () => {
		const fixture = configured();

		hook(fixture, 'protect-publish');
		fixture.write(
			'.claude/settings.json',
			settings(['.claude/hooks/protect-publish.mjs']),
		);
		fixture.write('.gitignore', '.roadmap/*\n');
		fixture.write(
			'.claude/CLAUDE.md',
			'# Contract\n\nThe plan is `.roadmap/MASTER-ROADMAP.md`.\n',
		);

		// Without a repository there are no ignore rules to read, and the
		// reference is reported — which is the answer a checker gives when it
		// cannot tell a missing file from one that was never committed.
		expect(rules(fixture.root)).toEqual(['reference-missing']);

		spawnSync('git', ['init'], { cwd: fixture.root });

		expect(rules(fixture.root)).toEqual([]);
	});
});

describe('this repository', () => {
	it('passes its own validator, warnings included', () => {
		expect(validateConfig()).toEqual([]);
	});
});
