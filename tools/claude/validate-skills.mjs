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

import { review as destructive } from '../../.claude/hooks/block-destructive.mjs';
import { review as protectedOperation } from '../../.claude/hooks/protect-publish.mjs';

import { error, report, warning } from './report.mjs';
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
} from './tree.mjs';

/**
 * The frontmatter keys a skill may set.
 *
 * Seven come from the contract in `.claude/skills/skill-authoring/SKILL.md`;
 * `paths` is the path-scoping key that `.roadmap/features/F04-skill-eval-harness.md`
 * asks to be validated where it is used. A key outside this set is an error
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
const SHELLS = new Set([
	'',
	'sh',
	'bash',
	'shell',
	'console',
	'pwsh',
	'powershell',
	'zsh',
]);

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
 * @param {string} body The body of `SKILL.md`.
 * @returns {string} The prose that makes claims about this repository.
 */
export const claimingProse = (body) => {
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
			quoting = /examples?\b/i.test(heading[1]);
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
 * @param {string} body The body of `SKILL.md`.
 * @returns {string[]} One entry per line of every shell fence.
 */
export const commandLines = (body) => {
	const lines = [];

	let language = null;

	for (const line of body.split(/\r?\n/)) {
		const fence = /^\s*```(\S*)/.exec(line);

		if (fence !== null) {
			language = language === null ? fence[1].toLowerCase() : null;
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
 * @param {string} prose The prose to read.
 * @returns {string[]} The references, deduplicated.
 */
export const referencesIn = (prose) => {
	const found = new Set();

	const consider = (candidate) => {
		const reference = candidate.trim();

		if (reference === '') return;
		if (/^(https?:|mailto:|#|@|\/)/.test(reference)) return;
		if (/[\s<>*?"|]/.test(reference)) return;
		if (!EXTENSIONS.test(reference)) return;

		// An extension on its own — `.js`, `.d.mts` — is a sentence about a
		// kind of file, not a reference to one.
		if (/^\.(d\.)?[a-z]+$/.test(reference)) return;

		found.add(reference.split('#')[0]);
	};

	for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
		consider(match[1]);
	}

	for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
		consider(match[1]);
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
 * @param {string} reference The reference as written.
 * @param {string} directory The absolute path of the skill directory.
 * @param {string} root The repository root.
 * @returns {boolean} Whether something is there.
 */
export const resolves = (reference, directory, root) => {
	if (exists(path.join(directory, reference))) return true;
	if (exists(path.join(root, reference))) return true;

	return !reference.includes('/') && basenamesOf(root).has(reference);
};

/**
 * The references of a document that point at nothing.
 *
 * Shared with `validate-claude-config.mjs`, because the contract and the rules
 * name files the same way a skill does and a reference is broken for the same
 * reason in all three. What git deliberately keeps out of the checkout is not
 * one of them — see `ignoredIn`.
 *
 * @param {string} prose The prose that makes claims about this repository.
 * @param {string} directory The directory the document sits in.
 * @param {string} root The repository root.
 * @param {string} where The path as a report spells it.
 * @returns {import('./report.mjs').Finding[]} One finding per dangling name.
 */
export const missingReferences = (prose, directory, root, where) => {
	const unresolved = referencesIn(prose).filter(
		(reference) => !resolves(reference, directory, root),
	);

	const ignored = ignoredIn(root, unresolved);

	return unresolved
		.filter((reference) => !ignored.has(reference))
		.map((reference) =>
			error(
				'reference-missing',
				where,
				`Names \`${reference}\`, which is not in the repository.`,
			),
		);
};

/**
 * Checks the frontmatter of one skill.
 *
 * @param {import('./tree.mjs').Skill} skill The skill.
 * @param {string} where The path as a report spells it.
 * @param {Map<string, string>} names Names already taken, to the directory.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkFrontmatter = (skill, where, names) => {
	const findings = [];
	const block = skill.frontmatter;

	if (block === null || !block.present) {
		return [
			error('frontmatter-missing', where, 'There is no frontmatter block.'),
		];
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

	const name = block.values.name;

	if (typeof name !== 'string' || name === '') {
		findings.push(error('name-missing', where, '`name` is not set.'));
	} else {
		if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
			findings.push(
				error(
					'name-shape',
					`${where} (name)`,
					`\`${name}\` is not kebab case.`,
				),
			);
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

		if (names.has(name)) {
			findings.push(
				error(
					'name-duplicate',
					`${where} (name)`,
					`\`${name}\` is already used by \`${names.get(name)}\`.`,
				),
			);
		} else {
			names.set(name, skill.directory);
		}

		if (BUNDLED.has(name) && !/replac/i.test(skill.manifest ?? '')) {
			findings.push(
				warning(
					'name-shadows-bundled',
					`${where} (name)`,
					`\`${name}\` is the name of a skill Claude Code ships; say in the file that replacing it is the point, or prefix the name.`,
				),
			);
		}
	}

	const description = block.values.description;

	if (typeof description !== 'string' || description.trim() === '') {
		findings.push(
			error('description-missing', where, '`description` is not set.'),
		);
	} else if (!/\b(use|when|usar|quando)\b/i.test(description)) {
		findings.push(
			warning(
				'description-trigger',
				`${where} (description)`,
				'Says what the skill does but never when to use it, which is where triggering is won or lost.',
			),
		);
	}

	for (const key of ['disable-model-invocation', 'user-invocable']) {
		if (key in block.values && typeof block.values[key] !== 'boolean') {
			findings.push(
				error(
					'frontmatter-type',
					`${where} (${key})`,
					'Takes `true` or `false`.',
				),
			);
		}
	}

	if ('context' in block.values && block.values.context !== 'fork') {
		findings.push(
			error(
				'frontmatter-type',
				`${where} (context)`,
				'`fork` is the only value this key takes.',
			),
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
 * @param {import('./tree.mjs').Skill} skill The skill.
 * @param {string} where The path as a report spells it.
 * @param {string} root The repository root.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkPaths = (skill, where, root) => {
	const value = skill.frontmatter?.values.paths;

	if (value === undefined) return [];

	const globs = Array.isArray(value) ? value : [`${value}`];
	const findings = [];

	if (globs.length === 0) {
		return [error('paths-empty', `${where} (paths)`, '`paths` is empty.')];
	}

	for (const glob of globs) {
		const base = glob.split(/[*?[]/)[0].replace(/\/[^/]*$/, '');

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
 * @param {import('./tree.mjs').Skill} skill The skill.
 * @param {string} where The path as a report spells it.
 * @param {string} root The repository root.
 * @param {{ scripts: Set<string>, agents: Set<string> }} available What exists.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkBody = (skill, where, root, available) => {
	const findings = [];
	const body = skill.frontmatter?.body ?? '';
	const directory = path.join(root, '.claude', 'skills', skill.directory);
	const prose = claimingProse(body);

	findings.push(...missingReferences(prose, directory, root, where));

	for (const match of body.matchAll(/npm run ([a-z][\w:-]*)/g)) {
		if (available.scripts.has(match[1])) continue;

		findings.push(
			error(
				'script-missing',
				where,
				`Names \`npm run ${match[1]}\`, which is not a script in \`package.json\`.`,
			),
		);
	}

	for (const match of body.matchAll(/\.claude\/agents\/([\w-]+)\.md/g)) {
		if (available.agents.has(match[1])) continue;

		findings.push(
			error(
				'agent-missing',
				where,
				`Delegates to the subagent \`${match[1]}\`, which is not declared under \`.claude/agents\`.`,
			),
		);
	}

	const optedOut =
		skill.frontmatter?.values['disable-model-invocation'] === true;

	if (!optedOut) {
		for (const line of commandLines(body)) {
			const refused =
				protectedOperation({ command: line }) ?? destructive({ command: line });

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
				`${skill.lines} lines; past about 500 the parts that matter are diluted by the parts that do not.`,
			),
		);
	}

	return findings;
};

/**
 * Checks one eval suite, and reports the coverage it gives its skill.
 *
 * @param {import('./tree.mjs').Evals} suite The suite.
 * @param {Map<string, string>} known The skill names, to their directories.
 * @param {Map<string, Set<string>>} covered Filled in with the kinds covered.
 * @returns {import('./report.mjs').Finding[]} What was found.
 */
const checkEvals = (suite, known, covered) => {
	const where = `tools/claude/skill-evals/${suite.file}`;

	if (suite.problem !== null || suite.document === null) {
		return [
			error(
				'eval-unreadable',
				where,
				`Not readable as JSON: ${suite.problem}.`,
			),
		];
	}

	const findings = [];
	const document = suite.document;
	const skill = document.skill;

	if (typeof skill !== 'string' || !known.has(skill)) {
		findings.push(
			error(
				'eval-unknown-skill',
				where,
				`\`skill\` names \`${skill}\`, which is not a skill in \`.claude/skills\`.`,
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

	if (!Array.isArray(cases) || cases.length === 0) {
		findings.push(error('eval-empty', where, 'There are no cases.'));

		return findings;
	}

	const ids = new Set();
	const kinds = new Set();

	for (const [index, entry] of cases.entries()) {
		const at = `${where} (case ${index + 1})`;

		if (typeof entry !== 'object' || entry === null) {
			findings.push(error('eval-case-shape', at, 'Not an object.'));
			continue;
		}

		const { id, kind, prompt, expect } =
			/** @type {Record<string, unknown>} */ (entry);

		if (typeof id !== 'string' || id === '') {
			findings.push(error('eval-case-id', at, '`id` is missing.'));
		} else if (ids.has(id)) {
			findings.push(error('eval-case-id', at, `\`${id}\` is used twice.`));
		} else {
			ids.add(id);
		}

		if (kind !== 'positive' && kind !== 'negative' && kind !== 'edge') {
			findings.push(
				error(
					'eval-case-kind',
					at,
					'`kind` is one of `positive`, `negative` or `edge`.',
				),
			);
		} else {
			kinds.add(kind);
		}

		if (typeof prompt !== 'string' || prompt.trim() === '') {
			findings.push(error('eval-case-prompt', at, '`prompt` is missing.'));
		}

		if (typeof expect !== 'object' || expect === null) {
			findings.push(error('eval-case-expect', at, '`expect` is missing.'));
			continue;
		}

		const expectation = /** @type {Record<string, unknown>} */ (expect);

		if (typeof expectation.invokes !== 'boolean') {
			findings.push(
				error('eval-case-expect', at, '`expect.invokes` is `true` or `false`.'),
			);
		} else if (kind === 'positive' && !expectation.invokes) {
			findings.push(
				error(
					'eval-case-expect',
					at,
					'A positive case is one that invokes the skill.',
				),
			);
		} else if (kind === 'negative' && expectation.invokes) {
			findings.push(
				error(
					'eval-case-expect',
					at,
					'A negative case is one that does not invoke the skill.',
				),
			);
		}

		if (
			expectation.invokes === true &&
			typeof expectation.output !== 'string'
		) {
			findings.push(
				error(
					'eval-case-expect',
					at,
					'`expect.output` says what shape the run has to produce; a case that cannot be judged is not a case.',
				),
			);
		}

		if ('refuses' in expectation && typeof expectation.refuses !== 'string') {
			findings.push(
				error('eval-case-expect', at, '`expect.refuses` is a sentence.'),
			);
		}
	}

	if (typeof skill === 'string') covered.set(skill, kinds);

	return findings;
};

/**
 * Validates the whole skill tree.
 *
 * @param {string} [root] The repository root.
 * @returns {import('./report.mjs').Finding[]} Everything found.
 */
export const validateSkills = (root = repositoryRoot) => {
	const findings = [];
	const skills = skillsOf(root);
	const available = { scripts: scriptsOf(root), agents: agentsOf(root) };
	const names = new Map();

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

	/** @type {Map<string, Set<string>>} */
	const covered = new Map();

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
if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const strict = process.argv.includes('--strict');

	process.exitCode = report('Skills', validateSkills(), { strict });
}
