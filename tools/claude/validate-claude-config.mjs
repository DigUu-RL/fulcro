/**
 * Structural validation of the rest of the `.claude` tree.
 *
 * The skills are checked next door, in `validate-skills.mjs`. What is left is
 * the machinery around them — the settings, the hooks they are wired to, the
 * rules the prompts point at — and it fails the same way skills do: in
 * silence. A hook whose path no longer resolves is not an error, it is a guard
 * that stopped running; a rule nobody links to is not a broken build, it is an
 * invariant nobody reads; a deny entry naming a tool no hook matches is a
 * protection that covers one shell and not the other.
 *
 * `.claude/rules/protected-operations.md` says the hooks are the enforcement
 * and the permission list is the belt beside the braces. This file is what
 * notices when one of the two quietly stops being either.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { matchedBy } from './glob.mjs';
import { error, report, warning } from './report.mjs';
import {
	displayed,
	exists,
	repositoryRoot,
	ruleFixturesOf,
	rulesOf,
	settingsOf,
} from './tree.mjs';
import { claimingProse, missingReferences } from './validate-skills.mjs';

/**
 * Hook modules that are libraries rather than guards.
 *
 * A guard exports `review` and is wired into the settings. These two are the
 * halves every guard is built from — the command line reader and the process
 * plumbing — and nothing runs them directly.
 */
const LIBRARIES = new Set(['command-line.mjs', 'hook.mjs']);

/**
 * The frontmatter keys a rule may set.
 *
 * One, deliberately. `paths` is what decides whether the rule is put in front
 * of a session working on a given file, and it is the only key of a rule this
 * repository relies on Claude Code reading. A second key added for the
 * convenience of a human reader would be ignored in silence if Claude Code
 * does not know it, which is the failure the rest of this file exists to
 * catch — a heading in the body says the same thing and is read by everyone.
 */
const RULE_KEYS = new Set(['paths']);

/**
 * The paragraphs of a rule that are prose rather than structure.
 *
 * Headings, table rows, list entries and fenced blocks repeat across files for
 * good reasons — two rules both listing `**Scope:**`, two tables sharing a
 * column header. A paragraph of prose repeated word for word in two rules is
 * the duplication the acceptance criteria ask about: one of the two will be
 * updated and the other will go on saying the old thing.
 *
 * @param {string} body The rule below its frontmatter.
 * @returns {string[]} The paragraphs, whitespace normalised.
 */
const proseParagraphs = (body) =>
	claimingProse(body)
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
		.filter(
			(paragraph) => paragraph.length >= 80 && !/^[|\-*>#]/.test(paragraph),
		);

/**
 * Every hook event of a settings document, flattened.
 *
 * @param {Record<string, unknown> | null} document The settings.
 * @returns {{ event: string, matcher: string, command: string }[]} The hooks.
 */
const hooksIn = (document) => {
	const found = [];
	const events = /** @type {Record<string, unknown>} */ (document?.hooks ?? {});

	for (const [event, entries] of Object.entries(events)) {
		if (!Array.isArray(entries)) continue;

		for (const entry of entries) {
			const matcher = typeof entry?.matcher === 'string' ? entry.matcher : '';

			for (const hook of entry?.hooks ?? []) {
				if (typeof hook?.command !== 'string') continue;

				found.push({ event, matcher, command: hook.command });
			}
		}
	}

	return found;
};

/**
 * The tools a permission entry applies to, and the command it names.
 *
 * @param {string} entry A line of `permissions.deny`, `Bash(git push:*)`.
 * @returns {{ tool: string, command: string } | null} The parts, or `null`.
 */
const permissionOf = (entry) => {
	const parsed = /^([A-Za-z]+)\(([^)]*)\)$/.exec(entry.trim());

	if (parsed === null) return null;

	return { tool: parsed[1], command: parsed[2].replace(/:\*$/, '').trim() };
};

/**
 * Checks the settings files and what they wire up.
 *
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkSettings = (root) => {
	const findings = [];
	const settings = settingsOf(root, 'settings.json');
	const local = settingsOf(root, 'settings.local.json');

	for (const file of [settings, local]) {
		if (file.present && file.problem !== null) {
			findings.push(
				error(
					'settings-unreadable',
					displayed(root, file.path),
					`Not readable as JSON: ${file.problem}.`,
				),
			);
		}
	}

	if (!settings.present) {
		return [
			...findings,
			error(
				'settings-missing',
				'.claude/settings.json',
				'There is no settings file.',
			),
		];
	}

	if (settings.document === null) return findings;

	const where = '.claude/settings.json';
	const hooks = hooksIn(settings.document);
	const wired = new Set();

	for (const hook of hooks) {
		for (const match of hook.command.matchAll(/[\w./-]+\.mjs/g)) {
			const script = match[0];

			if (!exists(path.join(root, script))) {
				findings.push(
					error(
						'hook-missing',
						`${where} (${hook.event})`,
						`Runs \`${script}\`, which is not in the repository.`,
					),
				);

				continue;
			}

			wired.add(path.basename(script));
		}
	}

	const directory = path.join(root, '.claude', 'hooks');
	const modules = exists(directory)
		? fs.readdirSync(directory).filter((file) => file.endsWith('.mjs'))
		: [];

	for (const module of modules) {
		const source = fs.readFileSync(path.join(directory, module), 'utf8');
		const guard = /export const review\b/.test(source);
		const at = `.claude/hooks/${module}`;

		if (guard && !wired.has(module)) {
			findings.push(
				error(
					'hook-unwired',
					at,
					'Exports a guard that no hook in `.claude/settings.json` runs.',
				),
			);
		}

		if (!guard && !LIBRARIES.has(module) && !wired.has(module)) {
			findings.push(
				warning(
					'hook-unused',
					at,
					'Neither wired into the settings nor a known library module.',
				),
			);
		}

		if (!guard) continue;

		const spec = path.join(
			root,
			'tests',
			'hooks',
			module.replace(/\.mjs$/, '.spec.mts'),
		);

		if (exists(spec)) continue;

		findings.push(
			error(
				'hook-untested',
				at,
				'A guard needs a suite in `tests/hooks/` for what it refuses and for what it keeps allowing.',
			),
		);
	}

	const matched = new Set(
		hooks
			.filter((hook) => hook.event === 'PreToolUse')
			.flatMap((hook) => hook.matcher.split('|').map((name) => name.trim())),
	);

	const denied = /** @type {unknown} */ (
		/** @type {Record<string, unknown>} */ (settings.document.permissions ?? {})
			.deny
	);

	/** @type {Map<string, Set<string>>} */
	const byCommand = new Map();

	for (const entry of Array.isArray(denied) ? denied : []) {
		const permission = permissionOf(`${entry}`);

		if (permission === null) {
			findings.push(
				error(
					'permission-shape',
					`${where} (permissions.deny)`,
					`\`${entry}\` is not \`Tool(command:*)\`.`,
				),
			);

			continue;
		}

		if (!matched.has(permission.tool)) {
			findings.push(
				error(
					'permission-unmatched',
					`${where} (permissions.deny)`,
					`\`${permission.tool}\` is denied a command but no \`PreToolUse\` hook matches that tool, so the guards never see it.`,
				),
			);
		}

		const tools = byCommand.get(permission.command) ?? new Set();

		tools.add(permission.tool);
		byCommand.set(permission.command, tools);
	}

	for (const [command, tools] of byCommand) {
		const missing = [...matched].filter((tool) => !tools.has(tool));

		if (missing.length === 0) continue;

		findings.push(
			warning(
				'permission-asymmetric',
				`${where} (permissions.deny)`,
				`\`${command}\` is denied for ${[...tools].join(', ')} but not for ${missing.join(', ')}; the same command runs from either shell.`,
			),
		);
	}

	return findings;
};

/**
 * Checks the rules and the contract that points at them.
 *
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkRules = (root) => {
	const findings = [];
	const directory = path.join(root, '.claude', 'rules');
	const contract = path.join(root, '.claude', 'CLAUDE.md');

	if (!exists(contract)) {
		findings.push(
			error(
				'contract-missing',
				'.claude/CLAUDE.md',
				'There is no project contract.',
			),
		);
	}

	if (!exists(directory)) return findings;

	const index = path.join(directory, 'README.md');
	const listing = exists(index) ? fs.readFileSync(index, 'utf8') : null;

	if (listing === null) {
		findings.push(
			error(
				'rules-index-missing',
				'.claude/rules/README.md',
				'The rules have no index.',
			),
		);
	}

	/** @type {Map<string, string>} */
	const paragraphs = new Map();

	for (const rule of rulesOf(root)) {
		const at = `.claude/rules/${rule.file}`;

		if (listing !== null && !listing.includes(rule.file)) {
			findings.push(
				error(
					'rule-unlisted',
					at,
					'Not listed in `.claude/rules/README.md`, which is where a session looks.',
				),
			);
		}

		if (!/\*\*Scope:\*\*/.test(rule.source)) {
			findings.push(
				warning(
					'rule-scope',
					at,
					'States no scope; a rule says where it applies.',
				),
			);
		}

		findings.push(...checkRuleFrontmatter(rule, at, root));

		for (const paragraph of proseParagraphs(rule.frontmatter.body)) {
			const seen = paragraphs.get(paragraph);

			if (seen === undefined) {
				paragraphs.set(paragraph, rule.file);
				continue;
			}

			findings.push(
				warning(
					'rule-duplicate',
					at,
					`Repeats a paragraph of \`${seen}\` word for word; one of the two will be updated and the other will not.`,
				),
			);
		}
	}

	return findings;
};

/**
 * Checks the frontmatter of one rule, and the scope it declares.
 *
 * @param {import('./tree.mjs').Rule} rule The rule.
 * @param {string} at The path as a report spells it.
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkRuleFrontmatter = (rule, at, root) => {
	const findings = [];
	const block = rule.frontmatter;

	// A rule without a block is loaded for every session, which is the shape
	// the short, always-relevant rules take.
	if (!block.present) return findings;

	for (const problem of block.problems) {
		findings.push(error('rule-frontmatter-unreadable', at, problem));
	}

	for (const key of block.order) {
		if (RULE_KEYS.has(key)) continue;

		findings.push(
			error(
				'rule-frontmatter-unknown-key',
				`${at} (${key})`,
				'Not a key a rule takes; an invented key is ignored in silence and the rule loads as if it were never scoped.',
			),
		);
	}

	const value = block.values.paths;

	if (value === undefined) return findings;

	const globs = Array.isArray(value) ? value : [`${value}`];

	if (globs.length === 0) {
		return [
			...findings,
			error(
				'rule-paths-empty',
				`${at} (paths)`,
				'`paths` is empty, which scopes the rule to nothing.',
			),
		];
	}

	for (const glob of globs) {
		const base = glob.split(/[*?[]/)[0].replace(/\/[^/]*$/, '');

		if (base === '' || exists(path.join(root, base))) continue;

		findings.push(
			error(
				'rule-paths-missing',
				`${at} (paths)`,
				`\`${glob}\` is scoped to \`${base}\`, which does not exist.`,
			),
		);
	}

	return findings;
};

/**
 * Checks the fixtures that prove each path-scoped rule loads where it should.
 *
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkRuleFixtures = (root) => {
	const findings = [];

	/** @type {Map<string, string[]>} */
	const scoped = new Map();

	for (const rule of rulesOf(root)) {
		const value = rule.frontmatter.values.paths;

		if (value === undefined) continue;

		scoped.set(rule.file, Array.isArray(value) ? value : [`${value}`]);
	}

	const covered = new Set();

	for (const fixture of ruleFixturesOf(root)) {
		const where = `tools/claude/rule-fixtures/${fixture.file}`;

		if (fixture.problem !== null || fixture.document === null) {
			findings.push(
				error(
					'fixture-unreadable',
					where,
					`Not readable as JSON: ${fixture.problem}.`,
				),
			);

			continue;
		}

		const named = fixture.document.rule;
		const expected = `${fixture.file.replace(/\.fixture\.json$/, '')}.md`;

		if (typeof named !== 'string' || !scoped.has(named)) {
			findings.push(
				error(
					'fixture-unknown-rule',
					where,
					`\`rule\` names \`${named}\`, which is not a path-scoped rule in \`.claude/rules\`.`,
				),
			);

			continue;
		}

		if (named !== expected) {
			findings.push(
				error(
					'fixture-file-name',
					where,
					`Holds the fixture of \`${named}\`; the file is named for \`${expected}\`.`,
				),
			);
		}

		covered.add(named);

		const globs = /** @type {string[]} */ (scoped.get(named));
		const loads = fixture.document.loads;
		const ignores = fixture.document.ignores;

		if (!Array.isArray(loads) || loads.length === 0) {
			findings.push(
				error(
					'fixture-empty',
					where,
					'`loads` names no file, so nothing here proves the rule is reached at all.',
				),
			);
		}

		for (const [key, entries] of [
			['loads', loads],
			['ignores', ignores],
		]) {
			for (const entry of Array.isArray(entries) ? entries : []) {
				const target = `${entry}`;

				if (!exists(path.join(root, ...target.split('/')))) {
					findings.push(
						error(
							'fixture-path-missing',
							`${where} (${key})`,
							`\`${target}\` is not in the repository; a glob proved against a file that is not there is proved against nothing.`,
						),
					);

					continue;
				}

				const matched = matchedBy(globs, target);

				if (key === 'loads' && !matched) {
					findings.push(
						error(
							'fixture-not-loaded',
							`${where} (loads)`,
							`\`${named}\` would not be loaded for \`${target}\`; its \`paths\` do not match it.`,
						),
					);
				}

				if (key === 'ignores' && matched) {
					findings.push(
						error(
							'fixture-loaded',
							`${where} (ignores)`,
							`\`${named}\` would be loaded for \`${target}\`, which the fixture says it must not be.`,
						),
					);
				}
			}
		}
	}

	for (const rule of scoped.keys()) {
		if (covered.has(rule)) continue;

		findings.push(
			error(
				'rule-fixture-missing',
				`.claude/rules/${rule}`,
				`Scoped by \`paths\` with nothing proving it; write \`tools/claude/rule-fixtures/${rule.replace(/\.md$/, '')}.fixture.json\`.`,
			),
		);
	}

	return findings;
};

/**
 * Checks what the contract and the rules name.
 *
 * The same reader the skills are checked with, for the same reason: a prompt
 * pointing at a file that was renamed sends the session looking for a
 * replacement rather than reporting a gap.
 *
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkReferences = (root) => {
	const findings = [];
	const files = [path.join(root, '.claude', 'CLAUDE.md')];
	const rules = path.join(root, '.claude', 'rules');

	if (exists(rules)) {
		for (const file of fs
			.readdirSync(rules)
			.filter((name) => name.endsWith('.md'))) {
			files.push(path.join(rules, file));
		}
	}

	for (const file of files) {
		if (!exists(file)) continue;

		const where = displayed(root, file);
		const prose = claimingProse(fs.readFileSync(file, 'utf8'));

		findings.push(...missingReferences(prose, path.dirname(file), root, where));
	}

	return findings;
};

/**
 * Validates the configuration around the skills.
 *
 * @param {string} [root] The repository root.
 * @returns {import('./report.mjs').Finding[]} Everything found.
 */
export const validateConfig = (root = repositoryRoot) => [
	...checkSettings(root),
	...checkRules(root),
	...checkRuleFixtures(root),
	...checkReferences(root),
];

// Run from the command line, imported by its tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const strict = process.argv.includes('--strict');

	process.exitCode = report('Configuration', validateConfig(), { strict });
}
