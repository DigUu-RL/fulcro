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

/**
 * A tree with the settings and a guard already in order, so that what a rule
 * case reports is the rule.
 *
 * @param rules How the index lists the rule files it knows about.
 * @returns The tree.
 */
const ruled = (rules: string[] = []): Tree => {
	const fixture = configured();

	hook(fixture, 'protect-publish');
	fixture.write(
		'.claude/settings.json',
		settings(['.claude/hooks/protect-publish.mjs']),
	);
	fixture.write(
		'.claude/rules/README.md',
		`# Rules\n\n${rules.map((file) => `- \`${file}\``).join('\n')}\n`,
	);

	return fixture;
};

/**
 * Writes a rule, and the source file a fixture for it points at.
 *
 * @param fixture The tree.
 * @param file The rule's file name.
 * @param frontmatter The lines of the block, or nothing for an unscoped rule.
 */
const rule = (fixture: Tree, file: string, frontmatter?: string): void => {
	fixture.write(
		`.claude/rules/${file}`,
		`${frontmatter === undefined ? '' : `---\n${frontmatter}\n---\n\n`}# ${file}\n\n**Scope:** somewhere\n`,
	);
};

describe('the frontmatter of a rule', () => {
	it('accepts a scope whose fixture holds up', () => {
		const fixture = ruled(['collections-performance.md']);

		rule(
			fixture,
			'collections-performance.md',
			'paths:\n  - packages/collections/src/**/*.ts',
		);
		fixture.write('packages/collections/src/index.ts', 'export {};\n');
		fixture.write('packages/parallel/src/index.ts', 'export {};\n');
		fixture.write(
			'tools/claude/rule-fixtures/collections-performance.fixture.json',
			JSON.stringify({
				rule: 'collections-performance.md',
				loads: ['packages/collections/src/index.ts'],
				ignores: ['packages/parallel/src/index.ts'],
			}),
		);

		expect(rules(fixture.root)).toEqual([]);
		expect(rules(fixture.root, 'warning')).toEqual([]);
	});

	it('reports a key Claude Code does not read', () => {
		const fixture = ruled(['general.md']);

		rule(fixture, 'general.md', 'description: how code is written');

		expect(rules(fixture.root)).toEqual(['rule-frontmatter-unknown-key']);
	});

	it('reports a scope pointing at a directory that is not there', () => {
		const fixture = ruled(['concurrency.md']);

		rule(fixture, 'concurrency.md', 'paths:\n  - packages/concurrency/**/*.ts');

		expect(rules(fixture.root)).toEqual([
			'rule-paths-missing',
			'rule-fixture-missing',
		]);
	});

	it('leaves a rule with no block alone, because it loads always', () => {
		const fixture = ruled(['git.md']);

		rule(fixture, 'git.md');

		expect(rules(fixture.root)).toEqual([]);
	});

	it('warns when two rules say the same thing word for word', () => {
		const fixture = ruled(['general.md', 'git.md']);
		const paragraph =
			'A name that has to be decoded is a name the next reader guesses at, and the guess is wrong exactly where it matters.';

		fixture.write(
			'.claude/rules/general.md',
			`# General\n\n**Scope:** everywhere\n\n${paragraph}\n`,
		);
		fixture.write(
			'.claude/rules/git.md',
			`# Git\n\n**Scope:** everywhere\n\n${paragraph}\n`,
		);

		expect(rules(fixture.root, 'warning')).toEqual(['rule-duplicate']);
	});
});

describe('the fixtures behind a path-scoped rule', () => {
	/**
	 * A tree with one scoped rule and two files to point a fixture at.
	 *
	 * @returns The tree.
	 */
	const scoped = (): Tree => {
		const fixture = ruled(['transformers.md']);

		rule(
			fixture,
			'transformers.md',
			'paths:\n  - packages/*/src/transformer/**/*.ts',
		);
		fixture.write('packages/reflect/src/transformer/index.ts', 'export {};\n');
		fixture.write('packages/reflect/src/index.ts', 'export {};\n');

		return fixture;
	};

	it('reports a scoped rule with nothing proving it', () => {
		expect(rules(scoped().root)).toEqual(['rule-fixture-missing']);
	});

	it('reports a file the rule would not in fact be loaded for', () => {
		const fixture = scoped();

		fixture.write(
			'tools/claude/rule-fixtures/transformers.fixture.json',
			JSON.stringify({
				rule: 'transformers.md',
				loads: ['packages/reflect/src/index.ts'],
			}),
		);

		expect(rules(fixture.root)).toEqual(['fixture-not-loaded']);
	});

	it('reports a file the rule would be loaded for and must not be', () => {
		const fixture = scoped();

		fixture.write(
			'tools/claude/rule-fixtures/transformers.fixture.json',
			JSON.stringify({
				rule: 'transformers.md',
				loads: ['packages/reflect/src/transformer/index.ts'],
				ignores: ['packages/reflect/src/transformer/index.ts'],
			}),
		);

		expect(rules(fixture.root)).toEqual(['fixture-loaded']);
	});

	it('reports a path that is not in the repository at all', () => {
		const fixture = scoped();

		fixture.write(
			'tools/claude/rule-fixtures/transformers.fixture.json',
			JSON.stringify({
				rule: 'transformers.md',
				loads: ['packages/reflect/src/transformer/renamed.ts'],
			}),
		);

		expect(rules(fixture.root)).toEqual(['fixture-path-missing']);
	});

	it('reports a fixture that proves nothing, and one named for the wrong rule', () => {
		const empty = scoped();

		empty.write(
			'tools/claude/rule-fixtures/transformers.fixture.json',
			JSON.stringify({ rule: 'transformers.md', loads: [] }),
		);

		expect(rules(empty.root)).toEqual(['fixture-empty']);

		const misnamed = scoped();

		misnamed.write(
			'tools/claude/rule-fixtures/transformer.fixture.json',
			JSON.stringify({
				rule: 'transformers.md',
				loads: ['packages/reflect/src/transformer/index.ts'],
			}),
		);

		expect(rules(misnamed.root)).toEqual(['fixture-file-name']);
	});

	it('reports one naming a rule that is not scoped, or not there', () => {
		const fixture = ruled(['git.md']);

		rule(fixture, 'git.md');
		fixture.write(
			'tools/claude/rule-fixtures/git.fixture.json',
			JSON.stringify({ rule: 'git.md', loads: [] }),
		);

		expect(rules(fixture.root)).toEqual(['fixture-unknown-rule']);
	});

	it('reports one that is not JSON', () => {
		const fixture = scoped();

		fixture.write(
			'tools/claude/rule-fixtures/transformers.fixture.json',
			'{ "rule": }\n',
		);

		expect(rules(fixture.root)).toEqual([
			'fixture-unreadable',
			'rule-fixture-missing',
		]);
	});
});

describe('this repository', () => {
	it('passes its own validator, warnings included', () => {
		expect(validateConfig()).toEqual([]);
	});
});
