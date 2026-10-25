/**
 * Structural validation of the rest of the `.claude` tree.
 *
 * The skills are checked next door, in `validate-skills.mts`. What is left is
 * the machinery around them — the settings, the hooks they are wired to, the
 * rules the prompts point at, the subagents work is delegated to — and it
 * fails the same way skills do: in
 * silence. A hook whose path no longer resolves is not an error, it is a guard
 * that stopped running; a rule nobody links to is not a broken build, it is an
 * invariant nobody reads; a deny entry naming a tool no hook matches is a
 * protection that covers one shell and not the other.
 *
 * `.claude/rules/protected-operations.md` says the hooks are the enforcement
 * and the permission list is the belt beside the braces. This file is what
 * notices when one of the two quietly stops being either.
 */

import fileSystem from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Value } from './frontmatter.mts';
import { matchedBy } from './glob.mts';
import type { Finding } from './report.mts';
import { error, report, warning } from './report.mts';
import type { Rule } from './tree.mts';
import {
	agentDefinitionsOf,
	displayed,
	exists,
	repositoryRoot,
	ruleFixturesOf,
	rulesOf,
	settingsOf,
} from './tree.mts';
import { claimingProse, missingReferences } from './validate-skills.mts';

/**
 * Hook modules that are libraries rather than guards.
 *
 * A guard exports `review` and is wired into the settings. These two are the
 * halves every guard is built from — the command line reader and the process
 * plumbing — and nothing runs them directly.
 */
const LIBRARIES = new Set(['command-line.mts', 'hook.mts']);

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
 * The frontmatter keys a subagent may set.
 *
 * The ones Claude Code documents whose values are scalars or lists. `hooks`,
 * `mcpServers` in its inline form and `experimental` take nested mappings,
 * which `frontmatter.mts` refuses rather than guesses at; an agent that needs
 * one is the case that extends the reader, not this list.
 */
const AGENT_KEYS = new Set([
	'name',
	'description',
	'tools',
	'disallowedTools',
	'model',
	'permissionMode',
	'maxTurns',
	'skills',
	'memory',
	'background',
	'omitClaudeMd',
	'effort',
	'isolation',
	'color',
	'initialPrompt',
]);

/**
 * The tools that write to the working tree.
 *
 * A subagent's edits land in the checkout without passing in front of the
 * session the user is watching, and the parent receives a report of them
 * rather than the diff. Every agent here reviews and reports; the first one
 * that has to write is a decision to argue here, not a line in its own file.
 */
const WRITING_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

/**
 * The paragraphs of a rule that are prose rather than structure.
 *
 * Headings, table rows, list entries and fenced blocks repeat across files for
 * good reasons — two rules both listing `**Scope:**`, two tables sharing a
 * column header. A paragraph of prose repeated word for word in two rules is
 * the duplication the acceptance criteria ask about: one of the two will be
 * updated and the other will go on saying the old thing.
 *
 * @param body The rule below its frontmatter.
 * @returns The paragraphs, whitespace normalised.
 */
const proseParagraphs = (body: string): string[] => {
	return claimingProse(body)
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
		.filter((paragraph) => paragraph.length >= 80 && !/^[|\-*>#]/.test(paragraph));
};

/**
 * Every hook event of a settings document, flattened.
 *
 * @param document The settings.
 * @returns The hooks.
 */
const hooksIn = (
	document: Record<string, unknown> | null,
): { event: string; matcher: string; command: string }[] => {
	const found = [];
	const events = document?.hooks ?? {};

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
 * @param entry A line of `permissions.deny`, `Bash(git push:*)`.
 * @returns The parts, or `null`.
 */
const permissionOf = (entry: string): { tool: string; command: string } | null => {
	const parsed = /^([A-Za-z]+)\(([^)]*)\)$/.exec(entry.trim());

	if (parsed === null) return null;

	const [, tool = '', command = ''] = parsed;

	return { tool, command: command.replace(/:\*$/, '').trim() };
};

/**
 * Checks the settings files and what they wire up.
 *
 * @param root The repository root.
 * @returns What was found.
 */
const checkSettings = (root: string): Finding[] => {
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
			error('settings-missing', '.claude/settings.json', 'There is no settings file.'),
		];
	}

	if (settings.document === null) return findings;

	const where = '.claude/settings.json';
	const hooks = hooksIn(settings.document);
	const wired = new Set();

	for (const hook of hooks) {
		for (const match of hook.command.matchAll(/[\w./-]+\.mts/g)) {
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
		? fileSystem.readdirSync(directory).filter((file) => file.endsWith('.mts'))
		: [];

	for (const module of modules) {
		const source = fileSystem.readFileSync(path.join(directory, module), 'utf8');
		const guard = /export const review\b/.test(source);
		const position = `.claude/hooks/${module}`;

		if (guard && !wired.has(module)) {
			findings.push(
				error(
					'hook-unwired',
					position,
					'Exports a guard that no hook in `.claude/settings.json` runs.',
				),
			);
		}

		if (!guard && !LIBRARIES.has(module) && !wired.has(module)) {
			findings.push(
				warning(
					'hook-unused',
					position,
					'Neither wired into the settings nor a known library module.',
				),
			);
		}

		if (!guard) continue;

		const spec = path.join(root, 'tests', 'hooks', module.replace(/\.mts$/, '.spec.mts'));

		if (exists(spec)) continue;

		findings.push(
			error(
				'hook-untested',
				position,
				'A guard needs a suite in `tests/hooks/` for what it refuses and for what it keeps allowing.',
			),
		);
	}

	const matched = new Set(
		hooks
			.filter((hook) => hook.event === 'PreToolUse')
			.flatMap((hook) => hook.matcher.split('|').map((name) => name.trim())),
	);

	const permissions: unknown = settings.document?.permissions;

	const denied: unknown =
		typeof permissions === 'object' && permissions !== null && 'deny' in permissions
			? permissions.deny
			: undefined;

	const byCommand = new Map<string, Set<string>>();

	for (const entry of Array.isArray(denied) ? denied : []) {
		const permission = permissionOf(String(entry));

		if (permission === null) {
			findings.push(
				error(
					'permission-shape',
					`${where} (permissions.deny)`,
					`\`${String(entry)}\` is not \`Tool(command:*)\`.`,
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
 * @param root The repository root.
 * @returns What was found.
 */
const checkRules = (root: string): Finding[] => {
	const findings = [];
	const directory = path.join(root, '.claude', 'rules');
	const contract = path.join(root, '.claude', 'CLAUDE.md');

	if (!exists(contract)) {
		findings.push(error('contract-missing', '.claude/CLAUDE.md', 'There is no project contract.'));
	}

	if (!exists(directory)) return findings;

	const index = path.join(directory, 'README.md');
	const listing = exists(index) ? fileSystem.readFileSync(index, 'utf8') : null;

	if (listing === null) {
		findings.push(
			error('rules-index-missing', '.claude/rules/README.md', 'The rules have no index.'),
		);
	}

	const paragraphs = new Map<string, string>();

	for (const rule of rulesOf(root)) {
		const position = `.claude/rules/${rule.file}`;

		if (listing !== null && !listing.includes(rule.file)) {
			findings.push(
				error(
					'rule-unlisted',
					position,
					'Not listed in `.claude/rules/README.md`, which is where a session looks.',
				),
			);
		}

		if (!rule.source.includes('**Scope:**')) {
			findings.push(
				warning('rule-scope', position, 'States no scope; a rule says where it applies.'),
			);
		}

		findings.push(...checkRuleFrontmatter(rule, position, root));

		for (const paragraph of proseParagraphs(rule.frontmatter.body)) {
			const seen = paragraphs.get(paragraph);

			if (seen === undefined) {
				paragraphs.set(paragraph, rule.file);
				continue;
			}

			findings.push(
				warning(
					'rule-duplicate',
					position,
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
 * @param rule The rule.
 * @param position The path as a report spells it.
 * @param root The repository root.
 * @returns What was found.
 */
const checkRuleFrontmatter = (rule: Rule, position: string, root: string): Finding[] => {
	const findings: Finding[] = [];
	const block = rule.frontmatter;

	// A rule without a block is loaded for every session, which is the shape
	// the short, always-relevant rules take.
	if (!block.present) return findings;

	for (const problem of block.problems) {
		findings.push(error('rule-frontmatter-unreadable', position, problem));
	}

	for (const key of block.order) {
		if (RULE_KEYS.has(key)) continue;

		findings.push(
			error(
				'rule-frontmatter-unknown-key',
				`${position} (${key})`,
				'Not a key a rule takes; an invented key is ignored in silence and the rule loads as if it were never scoped.',
			),
		);
	}

	const value = block.values.paths;

	if (value === undefined) return findings;

	const globs = Array.isArray(value) ? value : [String(value)];

	if (globs.length === 0) {
		return [
			...findings,
			error(
				'rule-paths-empty',
				`${position} (paths)`,
				'`paths` is empty, which scopes the rule to nothing.',
			),
		];
	}

	for (const glob of globs) {
		const base = (glob.split(/[*?[]/)[0] ?? '').replace(/\/[^/]*$/, '');

		if (base === '' || exists(path.join(root, base))) continue;

		findings.push(
			error(
				'rule-paths-missing',
				`${position} (paths)`,
				`\`${glob}\` is scoped to \`${base}\`, which does not exist.`,
			),
		);
	}

	return findings;
};

/**
 * Checks the fixtures that prove each path-scoped rule loads where it should.
 *
 * @param root The repository root.
 * @returns What was found.
 */
const checkRuleFixtures = (root: string): Finding[] => {
	const findings = [];

	const scoped = new Map<string, string[]>();

	for (const rule of rulesOf(root)) {
		const value = rule.frontmatter.values.paths;

		if (value === undefined) continue;

		scoped.set(rule.file, Array.isArray(value) ? value : [String(value)]);
	}

	const covered = new Set();

	for (const fixture of ruleFixturesOf(root)) {
		const where = `tools/claude/rule-fixtures/${fixture.file}`;

		if (fixture.problem !== null || fixture.document === null) {
			findings.push(
				error('fixture-unreadable', where, `Not readable as JSON: ${String(fixture.problem)}.`),
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
					`\`rule\` names \`${String(named)}\`, which is not a path-scoped rule in \`.claude/rules\`.`,
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

		const globs = scoped.get(named) ?? [];
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
				const target = String(entry);

				if (!exists(path.join(root, ...target.split('/')))) {
					findings.push(
						error(
							'fixture-path-missing',
							`${where} (${String(key)})`,
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
 * A tool list as a subagent's frontmatter writes it.
 *
 * Claude Code takes either a comma-separated string or a list.
 *
 * @param value The raw value.
 * @returns The tool names, or `null` when none was given.
 */
const toolsIn = (value: Value | undefined): string[] | null => {
	if (value === undefined) return null;
	if (Array.isArray(value)) return value.map((tool) => tool.trim());

	return String(value)
		.split(',')
		.map((tool) => tool.trim())
		.filter((tool) => tool !== '');
};

/**
 * Checks the subagents under `.claude/agents`.
 *
 * An agent fails the way a skill does — a block Claude Code cannot read is an
 * agent that is never delegated to, and nothing says so — plus one way of its
 * own: an agent that leaves `tools` out inherits every tool, writing ones
 * included, and a reviewer that can edit is a reviewer nobody watched edit.
 *
 * @param root The repository root.
 * @returns What was found.
 */
const checkAgents = (root: string): Finding[] => {
	const findings = [];

	for (const agent of agentDefinitionsOf(root)) {
		const position = `.claude/agents/${agent.file}`;
		const expected = agent.file.replace(/\.md$/, '');
		const block = agent.frontmatter;

		if (!block.present) {
			findings.push(
				error(
					'agent-frontmatter-missing',
					position,
					'Has no frontmatter, so Claude Code has no name or description to delegate by.',
				),
			);

			continue;
		}

		for (const problem of block.problems) {
			findings.push(error('agent-frontmatter-unreadable', position, problem));
		}

		for (const key of block.order) {
			if (AGENT_KEYS.has(key)) continue;

			findings.push(
				error(
					'agent-frontmatter-unknown-key',
					`${position} (${key})`,
					'Not a key this repository reads a subagent by; an invented or misspelt key is ignored in silence.',
				),
			);
		}

		if (block.values.name !== expected) {
			findings.push(
				error(
					'agent-name',
					`${position} (name)`,
					`\`name\` is \`${String(block.values.name ?? '')}\`; it must be \`${expected}\`, because a skill delegates by the file name and Claude Code by \`name\`.`,
				),
			);
		}

		const description = block.values.description;

		if (typeof description !== 'string' || description.trim() === '') {
			findings.push(
				error(
					'agent-description',
					`${position} (description)`,
					'Has no description, which is the only thing Claude Code reads to decide when to delegate.',
				),
			);
		}

		const tools = toolsIn(block.values.tools);

		if (tools === null) {
			findings.push(
				error(
					'agent-tools-undeclared',
					`${position} (tools)`,
					'Declares no `tools`, so it inherits every tool the session has — writing ones included.',
				),
			);
		}

		for (const tool of (tools ?? []).filter((name) => WRITING_TOOLS.has(name))) {
			findings.push(
				error(
					'agent-tools-writing',
					`${position} (tools)`,
					`Grants \`${tool}\`. A subagent's edits reach the working tree without passing in front of the session the user is watching; the agents here review and report.`,
				),
			);
		}

		if (block.body.trim() === '') {
			findings.push(
				error(
					'agent-body-empty',
					position,
					'Has no body; the body is the whole of the prompt the agent starts from.',
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
 * @param root The repository root.
 * @returns What was found.
 */
const checkReferences = (root: string): Finding[] => {
	const findings = [];
	const files = [path.join(root, '.claude', 'CLAUDE.md')];
	const rules = path.join(root, '.claude', 'rules');

	if (exists(rules)) {
		for (const file of fileSystem.readdirSync(rules).filter((name) => name.endsWith('.md'))) {
			files.push(path.join(rules, file));
		}
	}

	for (const agent of agentDefinitionsOf(root)) {
		files.push(agent.path);
	}

	for (const file of files) {
		if (!exists(file)) continue;

		const where = displayed(root, file);
		const prose = claimingProse(fileSystem.readFileSync(file, 'utf8'));

		findings.push(...missingReferences(prose, path.dirname(file), root, where));
	}

	return findings;
};

/**
 * Validates the configuration around the skills.
 *
 * @param [root] The repository root.
 * @returns Everything found.
 */
export const validateConfig = (root: string = repositoryRoot): Finding[] => {
	return [
		...checkSettings(root),
		...checkRules(root),
		...checkRuleFixtures(root),
		...checkAgents(root),
		...checkReferences(root),
	];
};

// Run from the command line, imported by its tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const strict = process.argv.includes('--strict');

	process.exitCode = report('Configuration', validateConfig(), { strict });
}
