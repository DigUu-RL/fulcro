/**
 * Structural validation of the skills under `.claude/skills`.
 *
 * A skill fails quietly. A frontmatter key Claude Code does not know is
 * ignored and reads exactly like one that works; a step naming a file that was
 * renamed six commits ago sends the session inventing a replacement; a name
 * that shadows a built-in command is never invoked at all. None of that
 * produces an error anywhere — it produces a plausible transcript, which is
 * the failure `.claude/skills/skill-authoring/SKILL.md` exists to describe and
 * this file exists to catch.
 *
 * What is checked here is only what a machine can decide. Whether the decision
 * criteria of a skill are reproducible, whether its description names a real
 * surface, whether its stop conditions are the right ones — those are the
 * review pass in `.claude/skills/skill-authoring/checklist.md`, run by a
 * person against a diff. This file checks the half that is mechanical, so the
 * review has the other half left to spend its attention on.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { review as destructive } from '../../.claude/hooks/block-destructive.mts';
import { review as protectedOperation } from '../../.claude/hooks/protect-publish.mts';

import { isList, isRecord } from './json.mts';
import type { Finding } from './report.mts';
import { error, report, warning } from './report.mts';
import type { Evals, Skill } from './tree.mts';
import {
	agentsOf,
	basenamesOf,
	displayed,
	evalsOf,
	exists,
	ignoredIn,
	repositoryRoot,
	scriptsOf,
	skillsOf,
} from './tree.mts';

/**
 * The frontmatter keys a skill may set.
 *
 * Seven come from the contract in `.claude/skills/skill-authoring/SKILL.md`;
 * `paths` is the path-scoping key that F04's specification (issue #105) asks to
 * be validated where it is used. A key outside this set is an error
 * rather than a warning because of how it fails: Claude Code ignores it in
 * silence, so the skill runs with whatever the missing key was meant to
 * prevent.
 */
const KEYS = new Set([
	'name',
	'description',
	'allowed-tools',
	'disable-model-invocation',
	'user-invocable',
	'context',
	'argument-hint',
	'paths',
]);

/**
 * Names that belong to Claude Code itself.
 *
 * A project skill taking one of these is not overriding it — it is writing a
 * file nobody reaches. The list is the built-in commands, not the bundled
 * skills: shadowing a bundled skill is sometimes the point, and §2 of the
 * standard says how to declare it, so that case is a warning below.
 */
const RESERVED = new Set([
	'add-dir',
	'agents',
	'bug',
	'clear',
	'compact',
	'config',
	'context',
	'cost',
	'doctor',
	'exit',
	'export',
	'help',
	'hooks',
	'ide',
	'login',
	'logout',
	'mcp',
	'memory',
	'model',
	'permissions',
	'privacy-settings',
	'resume',
	'rewind',
	'status',
	'statusline',
	'terminal-setup',
	'todos',
	'upgrade',
	'usage',
	'vim',
]);

/**
 * Names Claude Code ships a skill for.
 *
 * Taking one is allowed when replacing it is deliberate, and the standard asks
 * for that to be said in the file. The check below looks for it being said.
 */
const BUNDLED = new Set([
	'code-review',
	'docs',
	'init',
	'loop',
	'run',
	'schedule',
	'security-review',
	'simplify',
]);

/**
 * Languages of a fenced block whose contents are commands someone runs.
 *
 * An unlabelled fence counts. `text`, `json` and the rest do not: the report
 * shapes and sample outputs in a skill are full of command-looking lines that
 * describe rather than instruct, and reading those as instructions is how a
 * checker earns the reputation that gets it switched off.
 */
const SHELLS = new Set(['', 'sh', 'bash', 'shell', 'console', 'pwsh', 'powershell', 'zsh']);

/**
 * Extensions a reference has to carry to be checked as a path.
 *
 * Prose is full of path-shaped things that are not paths — an ESLint rule
 * named `local/brace-wrapped-branches`, a package named `@fulcro/collections`,
 * a slash command. Requiring an extension is what separates a reference to a
 * file from a mention of a name, and a directory reference such as
 * `.claude/rules/` is deliberately not checked: those appear in sentences
 * about directories that may not exist yet, which is not a broken link.
 */
const EXTENSIONS = /\.(md|mjs|cjs|js|mts|cts|ts|tsx|json|jsonc|ya?ml|toml)$/;

/**
 * The body with the parts that quote rather than instruct removed.
 *
 * Fenced blocks, block quotes and everything below an `Examples` heading. All
 * three hold text that looks like a reference and is not one: a sample
 * command, a good-and-bad pair of descriptions, an invocation naming a skill
 * that does not exist yet and is the whole point of the example.
 *
 * @param body The body of `SKILL.md`.
 * @returns The prose that makes claims about this repository.
 */
export const claimingProse = (body: string): string => {
	const kept = [];

	let fenced = false;
	let quoting = false;

	for (const line of body.split(/\r?\n/)) {
		const fence = /^\s*```/.test(line);

		if (fence) {
			fenced = !fenced;
			continue;
		}

		if (fenced) continue;

		const heading = /^#{1,6}\s+(.*)$/.exec(line);

		if (heading !== null) {
			quoting = /examples?\b/i.test(heading[1] ?? '');
			continue;
		}

		if (quoting || /^\s*>/.test(line)) continue;

		kept.push(line);
	}

	return kept.join('\n');
};

/**
 * The fenced blocks holding commands, as lines.
 *
 * @param body The body of `SKILL.md`.
 * @returns One entry per line of every shell fence.
 */
export const commandLines = (body: string): string[] => {
	const lines = [];

	let language = null;

	for (const line of body.split(/\r?\n/)) {
		const fence = /^\s*```(\S*)/.exec(line);

		if (fence !== null) {
			language = language === null ? (fence[1] ?? '').toLowerCase() : null;
			continue;
		}

		if (language !== null && SHELLS.has(language) && line.trim() !== '') {
			lines.push(line.trim());
		}
	}

	return lines;
};

/**
 * Every path-shaped reference in a stretch of prose.
 *
 * Both spellings a skill uses: a Markdown link, and a path in backticks.
 *
 * @param prose The prose to read.
 * @returns The references, deduplicated.
 */
export const referencesIn = (prose: string): string[] => {
	const found = new Set<string>();

	const consider = (candidate: string): void => {
		const reference = candidate.trim();

		if (reference === '') return;
		if (/^(https?:|mailto:|#|@|\/)/.test(reference)) return;
		if (/[\s<>*?"|]/.test(reference)) return;
		if (!EXTENSIONS.test(reference)) return;

		// An extension on its own — `.js`, `.d.mts` — is a sentence about a
		// kind of file, not a reference to one.
		if (/^\.(d\.)?[a-z]+$/.test(reference)) return;

		found.add(reference.split('#')[0] ?? '');
	};

	for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
		consider(match[1] ?? '');
	}

	for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
		consider(match[1] ?? '');
	}

	return [...found];
};

/**
 * Whether a reference resolves to a file that is there.
 *
 * A reference with a directory in it is resolved from the skill and then from
 * the repository root. A bare file name — `checklist.md`, `skill.md`,
 * `CLAUDE.md`, all written that way in the prose that names them — is
 * answered by whether a file of that name exists anywhere in the repository.
 *
 * @param reference The reference as written.
 * @param directory The absolute path of the skill directory.
 * @param root The repository root.
 * @returns Whether something is there.
 */
export const resolves = (reference: string, directory: string, root: string): boolean => {
	if (exists(path.join(directory, reference))) return true;
	if (exists(path.join(root, reference))) return true;

	return !reference.includes('/') && basenamesOf(root).has(reference);
};

/**
 * The references of a document that point at nothing.
 *
 * Shared with `validate-claude-config.mts`, because the contract and the rules
 * name files the same way a skill does and a reference is broken for the same
 * reason in all three. What git deliberately keeps out of the checkout is not
 * one of them — see `ignoredIn`.
 *
 * @param prose The prose that makes claims about this repository.
 * @param directory The directory the document sits in.
 * @param root The repository root.
 * @param where The path as a report spells it.
 * @returns One finding per dangling name.
 */
export const missingReferences = (
	prose: string,
	directory: string,
	root: string,
	where: string,
): Finding[] => {
	const unresolved = referencesIn(prose).filter(
		(reference) => !resolves(reference, directory, root),
	);

	const ignored = ignoredIn(root, unresolved);

	return unresolved
		.filter((reference) => !ignored.has(reference))
		.map((reference) => {
			return error(
				'reference-missing',
				where,
				`Names \`${reference}\`, which is not in the repository.`,
			);
		});
};

/**
 * Checks the name a skill declares, and claims it for that skill.
 *
 * @param name The `name` value, as read.
 * @param skill The skill.
 * @param where The path as a report spells it.
 * @param names Names already taken, to the directory; gains this one when it
 * is free.
 * @returns What was found.
 */
const checkName = (
	name: unknown,
	skill: Skill,
	where: string,
	names: Map<string, string>,
): Finding[] => {
	if (typeof name !== 'string' || name === '') {
		return [error('name-missing', where, '`name` is not set.')];
	}

	const findings = [];

	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
		findings.push(error('name-shape', `${where} (name)`, `\`${name}\` is not kebab case.`));
	}

	if (name !== skill.directory) {
		findings.push(
			error(
				'name-directory',
				`${where} (name)`,
				`\`${name}\` does not match the directory \`${skill.directory}\`.`,
			),
		);
	}

	if (RESERVED.has(name)) {
		findings.push(
			error(
				'name-reserved',
				`${where} (name)`,
				`\`${name}\` is a built-in Claude Code command; a skill with this name is never reached.`,
			),
		);
	}

	const owner: string | undefined = names.get(name);

	if (owner !== undefined) {
		findings.push(
			error('name-duplicate', `${where} (name)`, `\`${name}\` is already used by \`${owner}\`.`),
		);
	}

	// The first skill to claim a name keeps it, so every later one is reported
	// against the same owner.
	names.set(name, owner ?? skill.directory);

	if (BUNDLED.has(name) && !/replac/i.test(skill.manifest ?? '')) {
		findings.push(
			warning(
				'name-shadows-bundled',
				`${where} (name)`,
				`\`${name}\` is the name of a skill Claude Code ships; say in the file that replacing it is the point, or prefix the name.`,
			),
		);
	}

	return findings;
};

/**
 * Checks the description a skill declares.
 *
 * @param description The `description` value, as read.
 * @param where The path as a report spells it.
 * @returns What was found.
 */
const checkDescription = (description: unknown, where: string): Finding[] => {
	if (typeof description !== 'string' || description.trim() === '') {
		return [error('description-missing', where, '`description` is not set.')];
	}

	if (!/\b(use|when|usar|quando)\b/i.test(description)) {
		return [
			warning(
				'description-trigger',
				`${where} (description)`,
				'Says what the skill does but never when to use it, which is where triggering is won or lost.',
			),
		];
	}

	return [];
};

/**
 * Checks the frontmatter of one skill.
 *
 * @param skill The skill.
 * @param where The path as a report spells it.
 * @param names Names already taken, to the directory.
 * @returns What was found.
 */
const checkFrontmatter = (skill: Skill, where: string, names: Map<string, string>): Finding[] => {
	const findings = [];
	const block = skill.frontmatter;

	if (!block?.present) {
		return [error('frontmatter-missing', where, 'There is no frontmatter block.')];
	}

	for (const problem of block.problems) {
		findings.push(error('frontmatter-unreadable', where, problem));
	}

	for (const key of block.order) {
		if (!KEYS.has(key)) {
			findings.push(
				error(
					'frontmatter-unknown-key',
					`${where} (${key})`,
					'Not a key Claude Code reads; an invented key is ignored in silence.',
				),
			);
		}
	}

	findings.push(
		...checkName(block.values.name, skill, where, names),
		...checkDescription(block.values.description, where),
	);

	for (const key of ['disable-model-invocation', 'user-invocable']) {
		if (key in block.values && typeof block.values[key] !== 'boolean') {
			findings.push(error('frontmatter-type', `${where} (${key})`, 'Takes `true` or `false`.'));
		}
	}

	if ('context' in block.values && block.values.context !== 'fork') {
		findings.push(
			error('frontmatter-type', `${where} (context)`, '`fork` is the only value this key takes.'),
		);
	}

	return findings;
};

/**
 * Checks the `paths` values of one skill.
 *
 * A value is a glob, so what is checked is the part before the first wildcard:
 * a directory that is not there scopes the skill to nothing, and does it
 * without a word.
 *
 * @param skill The skill.
 * @param where The path as a report spells it.
 * @param root The repository root.
 * @returns What was found.
 */
const checkPaths = (skill: Skill, where: string, root: string): Finding[] => {
	const value = skill.frontmatter?.values.paths;

	if (value === undefined) return [];

	const globs = Array.isArray(value) ? value : [String(value)];
	const findings = [];

	if (globs.length === 0) {
		return [error('paths-empty', `${where} (paths)`, '`paths` is empty.')];
	}

	for (const glob of globs) {
		const base = (glob.split(/[*?[]/)[0] ?? '').replace(/\/[^/]*$/, '');

		if (base === '' || exists(path.join(root, base))) continue;

		findings.push(
			error(
				'paths-missing',
				`${where} (paths)`,
				`\`${glob}\` is scoped to \`${base}\`, which does not exist.`,
			),
		);
	}

	return findings;
};

/**
 * Checks what the body of one skill names.
 *
 * @param skill The skill.
 * @param where The path as a report spells it.
 * @param root The repository root.
 * @param available What exists.
 * @returns What was found.
 */
const checkBody = (
	skill: Skill,
	where: string,
	root: string,
	available: { scripts: Set<string>; agents: Set<string> },
): Finding[] => {
	const findings = [];
	const body = skill.frontmatter?.body ?? '';
	const directory = path.join(root, '.claude', 'skills', skill.directory);
	const prose = claimingProse(body);

	findings.push(...missingReferences(prose, directory, root, where));

	for (const match of body.matchAll(/npm run ([a-z][\w:-]*)/g)) {
		if (available.scripts.has(match[1] ?? '')) continue;

		findings.push(
			error(
				'script-missing',
				where,
				`Names \`npm run ${String(match[1])}\`, which is not a script in \`package.json\`.`,
			),
		);
	}

	for (const match of body.matchAll(/\.claude\/agents\/([\w-]+)\.md/g)) {
		if (available.agents.has(match[1] ?? '')) continue;

		findings.push(
			error(
				'agent-missing',
				where,
				`Delegates to the subagent \`${String(match[1])}\`, which is not declared under \`.claude/agents\`.`,
			),
		);
	}

	const optedOut = skill.frontmatter?.values['disable-model-invocation'] === true;

	if (!optedOut) {
		for (const line of commandLines(body)) {
			const refused = protectedOperation({ command: line }) ?? destructive({ command: line });

			if (refused === null) continue;

			findings.push(
				error(
					'dangerous-auto-invocable',
					where,
					`Runs \`${line}\`, which the hooks refuse; a skill reaching for it needs \`disable-model-invocation: true\` and a reason.`,
				),
			);
		}
	}

	if (skill.lines > 500) {
		findings.push(
			warning(
				'size',
				where,
				`${String(skill.lines)} lines; past about 500 the parts that matter are diluted by the parts that do not.`,
			),
		);
	}

	return findings;
};

/**
 * Checks the `id` of one eval case, and claims it for the suite.
 *
 * @param id The `id` value, as read.
 * @param ids The ids the suite has already used; gains this one when it is
 * new.
 * @param position The case as a report spells it.
 * @returns What was found.
 */
const checkCaseId = (id: unknown, ids: Set<unknown>, position: string): Finding[] => {
	if (typeof id !== 'string' || id === '') {
		return [error('eval-case-id', position, '`id` is missing.')];
	}

	if (ids.has(id)) return [error('eval-case-id', position, `\`${id}\` is used twice.`)];

	ids.add(id);

	return [];
};

/**
 * Checks the `kind` of one eval case, and counts it towards the suite's
 * coverage.
 *
 * @param kind The `kind` value, as read.
 * @param kinds The kinds the suite covers; gains this one when it is known.
 * @param position The case as a report spells it.
 * @returns What was found.
 */
const checkCaseKind = (kind: unknown, kinds: Set<string>, position: string): Finding[] => {
	if (kind !== 'positive' && kind !== 'negative' && kind !== 'edge') {
		return [
			error('eval-case-kind', position, '`kind` is one of `positive`, `negative` or `edge`.'),
		];
	}

	kinds.add(kind);

	return [];
};

/**
 * Checks that what a case expects to invoke agrees with its kind.
 *
 * @param invokes The `expect.invokes` value, as read.
 * @param kind The `kind` value, as read.
 * @param position The case as a report spells it.
 * @returns What was found.
 */
const checkInvokes = (invokes: unknown, kind: unknown, position: string): Finding[] => {
	if (typeof invokes !== 'boolean') {
		return [error('eval-case-expect', position, '`expect.invokes` is `true` or `false`.')];
	}

	if (kind === 'positive' && !invokes) {
		return [error('eval-case-expect', position, 'A positive case is one that invokes the skill.')];
	}

	if (kind === 'negative' && invokes) {
		return [
			error('eval-case-expect', position, 'A negative case is one that does not invoke the skill.'),
		];
	}

	return [];
};

/**
 * Checks one eval suite, and reports the coverage it gives its skill.
 *
 * @param suite The suite.
 * @param known The skill names, to their directories.
 * @param covered Filled in with the kinds covered.
 * @returns What was found.
 */
const checkEvals = (
	suite: Evals,
	known: Map<string, string>,
	covered: Map<string, Set<string>>,
): Finding[] => {
	const where = `tools/claude/skill-evals/${suite.file}`;

	if (suite.problem !== null || suite.document === null) {
		return [error('eval-unreadable', where, `Not readable as JSON: ${String(suite.problem)}.`)];
	}

	const findings = [];
	const document = suite.document;
	const skill = document.skill;

	if (typeof skill !== 'string' || !known.has(skill)) {
		findings.push(
			error(
				'eval-unknown-skill',
				where,
				`\`skill\` names \`${String(skill)}\`, which is not a skill in \`.claude/skills\`.`,
			),
		);
	}

	const expected = suite.file.replace(/\.eval\.json$/, '');

	if (typeof skill === 'string' && skill !== expected) {
		findings.push(
			error(
				'eval-file-name',
				where,
				`Holds the evals of \`${skill}\`; the file is named for \`${expected}\`.`,
			),
		);
	}

	const cases = document.cases;

	if (!isList(cases) || cases.length === 0) {
		findings.push(error('eval-empty', where, 'There are no cases.'));

		return findings;
	}

	const ids = new Set<unknown>();
	const kinds = new Set<string>();

	for (const [index, entry] of cases.entries()) {
		const position = `${where} (case ${String(index + 1)})`;

		if (!isRecord(entry)) {
			findings.push(error('eval-case-shape', position, 'Not an object.'));
			continue;
		}

		const { id, kind, prompt, expect } = entry;

		findings.push(...checkCaseId(id, ids, position), ...checkCaseKind(kind, kinds, position));

		if (typeof prompt !== 'string' || prompt.trim() === '') {
			findings.push(error('eval-case-prompt', position, '`prompt` is missing.'));
		}

		if (!isRecord(expect)) {
			findings.push(error('eval-case-expect', position, '`expect` is missing.'));
			continue;
		}

		const expectation = expect;

		findings.push(...checkInvokes(expectation.invokes, kind, position));

		if (expectation.invokes === true && typeof expectation.output !== 'string') {
			findings.push(
				error(
					'eval-case-expect',
					position,
					'`expect.output` says what shape the run has to produce; a case that cannot be judged is not a case.',
				),
			);
		}

		if ('refuses' in expectation && typeof expectation.refuses !== 'string') {
			findings.push(error('eval-case-expect', position, '`expect.refuses` is a sentence.'));
		}
	}

	if (typeof skill === 'string') covered.set(skill, kinds);

	return findings;
};

/**
 * Validates the whole skill tree.
 *
 * @param [root] The repository root.
 * @returns Everything found.
 */
export const validateSkills = (root: string = repositoryRoot): Finding[] => {
	const findings = [];
	const skills = skillsOf(root);
	const available = { scripts: scriptsOf(root), agents: agentsOf(root) };
	const names = new Map<string, string>();

	for (const skill of skills) {
		const where = displayed(root, skill.path);

		if (skill.manifest === null) {
			findings.push(
				error(
					'skill-orphaned',
					displayed(root, path.dirname(skill.path)),
					'A directory under `.claude/skills` with no `SKILL.md` in it.',
				),
			);

			continue;
		}

		findings.push(...checkFrontmatter(skill, where, names));
		findings.push(...checkPaths(skill, where, root));
		findings.push(...checkBody(skill, where, root, available));
	}

	const covered = new Map<string, Set<string>>();

	for (const suite of evalsOf(root)) {
		findings.push(...checkEvals(suite, names, covered));
	}

	for (const [name, directory] of names) {
		const kinds = covered.get(name);
		const where = `.claude/skills/${directory}/SKILL.md`;

		if (kinds === undefined) {
			findings.push(
				warning(
					'eval-absent',
					where,
					`No eval suite; write \`tools/claude/skill-evals/${name}.eval.json\`.`,
				),
			);

			continue;
		}

		for (const kind of ['positive', 'negative', 'edge']) {
			if (kinds.has(kind)) continue;

			findings.push(
				warning(
					'eval-coverage',
					`tools/claude/skill-evals/${name}.eval.json`,
					`No ${kind} case; a skill without one has no stated edge on that side.`,
				),
			);
		}
	}

	return findings;
};

// Run from the command line, imported by its tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const strict = process.argv.includes('--strict');

	process.exitCode = report('Skills', validateSkills(), { strict });
}
