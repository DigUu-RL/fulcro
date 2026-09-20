/**
 * Reading the `.claude` tree from disk.
 *
 * Both validators start from the same picture — the skills, their supporting
 * files, the hooks, the rules, the settings and the eval suites — so it is
 * gathered once, here, and handed to them as data. That is also what makes the
 * validators testable against a tree that is not this repository's: a suite
 * builds a directory in a temporary folder, reads it with these functions, and
 * asserts on the findings.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOf } from './frontmatter.mjs';

/**
 * The repository root, found from this file rather than from the process.
 *
 * `process.cwd()` is whatever directory the caller happened to be in, and the
 * validators read fixed paths under it. This file is two directories below the
 * root and stays there.
 */
export const repositoryRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

/**
 * Whether a path exists, whatever it is.
 *
 * @param {string} target An absolute path.
 * @returns {boolean} Whether anything is there.
 */
export const exists = (target) => fs.existsSync(target);

/**
 * A path as it is written in a report: relative to the root, forward slashes.
 *
 * The separator is normalised on purpose. A finding is compared in tests and
 * read by a human on either platform, and `\.claude\skills` in the output of a
 * Windows run would make both harder than they need to be.
 *
 * @param {string} root The repository root.
 * @param {string} target An absolute path inside it.
 * @returns {string} The path as a report spells it.
 */
export const displayed = (root, target) =>
	path.relative(root, target).split(path.sep).join('/');

/**
 * Every file below a directory, as paths relative to it.
 *
 * @param {string} directory An absolute path.
 * @param {string} [prefix] Used by the recursion; callers leave it out.
 * @returns {string[]} The files, with forward slashes, in no particular order.
 */
export const filesUnder = (directory, prefix = '') => {
	if (!exists(directory)) return [];

	/** @type {string[]} */
	const found = [];

	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;

		if (entry.isDirectory()) {
			found.push(...filesUnder(path.join(directory, entry.name), relative));
		} else {
			found.push(relative);
		}
	}

	return found;
};

/**
 * Directories a reference never means.
 */
const UNSEARCHED = new Set(['.git', 'node_modules', 'dist', 'coverage']);

/** @type {Map<string, Set<string>>} */
const basenames = new Map();

/**
 * Every file name in the repository, without its directory.
 *
 * Prose names a file both ways — `tsconfig.build.json` in a sentence about
 * every package, `.claude/hooks/protect-publish.mjs` in a table — and only one
 * of the two can be resolved by joining paths. The other is answered by
 * knowing which names exist, which is this set. Walked once per root and kept,
 * because both validators ask.
 *
 * @param {string} [root] The repository root.
 * @returns {Set<string>} The file names.
 */
export const basenamesOf = (root = repositoryRoot) => {
	const remembered = basenames.get(root);

	if (remembered !== undefined) return remembered;

	/** @type {Set<string>} */
	const found = new Set();

	const walk = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (UNSEARCHED.has(entry.name)) continue;

				walk(path.join(directory, entry.name));
				continue;
			}

			found.add(entry.name);
		}
	};

	walk(root);
	basenames.set(root, found);

	return found;
};

/**
 * Which of these paths the repository deliberately keeps out of itself.
 *
 * A prompt may point at something that is not committed — `.roadmap/` is
 * ignored here, and the planning tree it holds is a local working copy rather
 * than part of the checkout. On the machine that wrote the sentence the file
 * is right there, and on a clean checkout it is not, so a validator reading
 * only the disk answers differently in the two places. That is exactly the
 * failure this repository already learnt once, in the `.gitignore` comment
 * about the thirteen tests: the first clean checkout is where a missing file
 * is noticed.
 *
 * So the question is put to git, which is the only thing that knows the
 * difference between a file that is missing and a file that was never meant
 * to be there. Where git cannot answer — no repository, no git on the machine
 * — nothing is ignored and every unresolved reference is reported, which is
 * the stricter of the two answers.
 *
 * @param {string} root The repository root.
 * @param {string[]} references The paths that did not resolve on disk.
 * @returns {Set<string>} The ones an ignore rule accounts for.
 */
export const ignoredIn = (root, references) => {
	if (references.length === 0) return new Set();

	const asked = spawnSync('git', ['check-ignore', '--stdin'], {
		cwd: root,
		input: references.join('\n'),
		encoding: 'utf8',
	});

	// 0 is "some are ignored", 1 is "none are". Anything else — 128 for no
	// repository, or the spawn failing outright — leaves the set empty.
	if (asked.error !== undefined || (asked.status !== 0 && asked.status !== 1)) {
		return new Set();
	}

	return new Set(
		(asked.stdout ?? '')
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line !== ''),
	);
};

/**
 * One skill as it sits on disk.
 *
 * `manifest` is `null` when the directory holds no `SKILL.md` at all, which is
 * the orphan the validator reports rather than a skill with a missing field.
 *
 * @typedef {{
 *   directory: string,
 *   path: string,
 *   manifest: string | null,
 *   frontmatter: ReturnType<typeof frontmatterOf> | null,
 *   lines: number,
 *   files: string[],
 * }} Skill
 */

/**
 * Reads every skill directory.
 *
 * @param {string} [root] The repository root.
 * @returns {Skill[]} The skills, ordered by directory name.
 */
export const skillsOf = (root = repositoryRoot) => {
	const base = path.join(root, '.claude', 'skills');

	if (!exists(base)) return [];

	return fs
		.readdirSync(base, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const directory = path.join(base, entry.name);
			const manifestPath = path.join(directory, 'SKILL.md');
			const manifest = exists(manifestPath)
				? fs.readFileSync(manifestPath, 'utf8')
				: null;

			return {
				directory: entry.name,
				path: manifestPath,
				manifest,
				frontmatter: manifest === null ? null : frontmatterOf(manifest),
				lines: manifest === null ? 0 : manifest.split(/\r?\n/).length,
				files: filesUnder(directory).filter((file) => file !== 'SKILL.md'),
			};
		})
		.sort((left, right) => left.directory.localeCompare(right.directory));
};

/**
 * One rule as it sits on disk.
 *
 * `frontmatter` is read for every rule, present or not: a rule with no block
 * is loaded always, which is a decision rather than an omission, and the
 * validator reports on both.
 *
 * @typedef {{
 *   file: string,
 *   path: string,
 *   source: string,
 *   frontmatter: ReturnType<typeof frontmatterOf>,
 * }} Rule
 */

/**
 * Reads every rule under `.claude/rules`, index excluded.
 *
 * @param {string} [root] The repository root.
 * @returns {Rule[]} The rules, ordered by file name.
 */
export const rulesOf = (root = repositoryRoot) => {
	const base = path.join(root, '.claude', 'rules');

	if (!exists(base)) return [];

	return fs
		.readdirSync(base)
		.filter((file) => file.endsWith('.md') && file !== 'README.md')
		.sort()
		.map((file) => {
			const full = path.join(base, file);
			const source = fs.readFileSync(full, 'utf8');

			return { file, path: full, source, frontmatter: frontmatterOf(source) };
		});
};

/**
 * One rule fixture, as read from `tools/claude/rule-fixtures`.
 *
 * @typedef {{
 *   file: string,
 *   path: string,
 *   document: Record<string, unknown> | null,
 *   problem: string | null,
 * }} RuleFixture
 */

/**
 * Reads every rule fixture.
 *
 * @param {string} [root] The repository root.
 * @returns {RuleFixture[]} The fixtures, ordered by file name.
 */
export const ruleFixturesOf = (root = repositoryRoot) => {
	const base = path.join(root, 'tools', 'claude', 'rule-fixtures');

	if (!exists(base)) return [];

	return fs
		.readdirSync(base)
		.filter((file) => file.endsWith('.fixture.json'))
		.sort()
		.map((file) => {
			const full = path.join(base, file);

			try {
				return {
					file,
					path: full,
					document: JSON.parse(fs.readFileSync(full, 'utf8')),
					problem: null,
				};
			} catch (failure) {
				return { file, path: full, document: null, problem: `${failure}` };
			}
		});
};

/**
 * One eval suite, as read from `tools/claude/skill-evals`.
 *
 * `cases` is whatever the file contained; validating its shape belongs to the
 * validator, not to the reader. A file that is not JSON at all arrives here as
 * a `problem` and an empty document.
 *
 * @typedef {{
 *   file: string,
 *   path: string,
 *   document: Record<string, unknown> | null,
 *   problem: string | null,
 * }} Evals
 */

/**
 * Reads every eval suite.
 *
 * @param {string} [root] The repository root.
 * @returns {Evals[]} The suites, ordered by file name.
 */
export const evalsOf = (root = repositoryRoot) => {
	const base = path.join(root, 'tools', 'claude', 'skill-evals');

	if (!exists(base)) return [];

	return fs
		.readdirSync(base)
		.filter((file) => file.endsWith('.eval.json'))
		.sort()
		.map((file) => {
			const full = path.join(base, file);

			try {
				return {
					file,
					path: full,
					document: JSON.parse(fs.readFileSync(full, 'utf8')),
					problem: null,
				};
			} catch (failure) {
				return {
					file,
					path: full,
					document: null,
					problem: `${failure}`,
				};
			}
		});
};

/**
 * Reads a settings file, if it is there.
 *
 * @param {string} root The repository root.
 * @param {string} name `settings.json` or `settings.local.json`.
 * @returns {{
 *   name: string,
 *   path: string,
 *   present: boolean,
 *   document: Record<string, unknown> | null,
 *   problem: string | null,
 * }} The settings.
 */
export const settingsOf = (root, name) => {
	const full = path.join(root, '.claude', name);

	if (!exists(full)) {
		return { name, path: full, present: false, document: null, problem: null };
	}

	try {
		return {
			name,
			path: full,
			present: true,
			document: JSON.parse(fs.readFileSync(full, 'utf8')),
			problem: null,
		};
	} catch (failure) {
		return {
			name,
			path: full,
			present: true,
			document: null,
			problem: `${failure}`,
		};
	}
};

/**
 * The scripts declared by the root `package.json`.
 *
 * @param {string} [root] The repository root.
 * @returns {Set<string>} The script names.
 */
export const scriptsOf = (root = repositoryRoot) => {
	const manifest = path.join(root, 'package.json');

	if (!exists(manifest)) return new Set();

	const document = JSON.parse(fs.readFileSync(manifest, 'utf8'));

	return new Set(Object.keys(document.scripts ?? {}));
};

/**
 * The subagents declared under `.claude/agents`.
 *
 * The directory does not exist yet; the reader answers with an empty set
 * rather than throwing, so that the first agent to arrive is validated by a
 * check that was already running.
 *
 * @param {string} [root] The repository root.
 * @returns {Set<string>} The agent names, without the `.md`.
 */
export const agentsOf = (root = repositoryRoot) => {
	const base = path.join(root, '.claude', 'agents');

	if (!exists(base)) return new Set();

	return new Set(
		fs
			.readdirSync(base)
			.filter((file) => file.endsWith('.md'))
			.map((file) => file.replace(/\.md$/, '')),
	);
};
