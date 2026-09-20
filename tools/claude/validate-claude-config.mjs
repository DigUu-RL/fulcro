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

import { error, report, warning } from './report.mjs';
import { displayed, exists, repositoryRoot, settingsOf } from './tree.mjs';
import { claimingProse, referencesIn, resolves } from './validate-skills.mjs';

/**
 * Hook modules that are libraries rather than guards.
 *
 * A guard exports `review` and is wired into the settings. These two are the
 * halves every guard is built from — the command line reader and the process
 * plumbing — and nothing runs them directly.
 */
const LIBRARIES = new Set(['command-line.mjs', 'hook.mjs']);

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

	for (const file of fs
		.readdirSync(directory)
		.filter((name) => name.endsWith('.md'))) {
		const at = `.claude/rules/${file}`;
		const source = fs.readFileSync(path.join(directory, file), 'utf8');

		if (file === 'README.md') continue;

		if (listing !== null && !listing.includes(file)) {
			findings.push(
				error(
					'rule-unlisted',
					at,
					'Not listed in `.claude/rules/README.md`, which is where a session looks.',
				),
			);
		}

		if (!/\*\*Scope:\*\*/.test(source)) {
			findings.push(
				warning(
					'rule-scope',
					at,
					'States no scope; a rule says where it applies.',
				),
			);
		}
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

		for (const reference of referencesIn(prose)) {
			if (resolves(reference, path.dirname(file), root)) continue;

			findings.push(
				error(
					'reference-missing',
					where,
					`Names \`${reference}\`, which is not in the repository.`,
				),
			);
		}
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
