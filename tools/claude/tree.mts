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
import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frontmatterOf } from './frontmatter.mts';

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
 * @param target An absolute path.
 * @returns Whether anything is there.
 */
export const exists = (target: string): boolean => fileSystem.existsSync(target);

/**
 * A path as it is written in a report: relative to the root, forward slashes.
 *
 * The separator is normalised on purpose. A finding is compared in tests and
 * read by a human on either platform, and `\.claude\skills` in the output of a
 * Windows run would make both harder than they need to be.
 *
 * @param root The repository root.
 * @param target An absolute path inside it.
 * @returns The path as a report spells it.
 */
export const displayed = (root: string, target: string): string => {
	return path.relative(root, target).split(path.sep).join('/');
};

/**
 * Every file below a directory, as paths relative to it.
 *
 * @param directory An absolute path.
 * @param [prefix] Used by the recursion; callers leave it out.
 * @returns The files, with forward slashes, in no particular order.
 */
export const filesUnder = (directory: string, prefix: string = ''): string[] => {
	if (!exists(directory)) return [];

	const found: string[] = [];

	for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
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

const basenames = new Map<string, Set<string>>();

/**
 * Every file name in the repository, without its directory.
 *
 * Prose names a file both ways — `tsconfig.build.json` in a sentence about
 * every package, `.claude/hooks/protect-publish.mts` in a table — and only one
 * of the two can be resolved by joining paths. The other is answered by
 * knowing which names exist, which is this set. Walked once per root and kept,
 * because both validators ask.
 *
 * @param [root] The repository root.
 * @returns The file names.
 */
export const basenamesOf = (root: string = repositoryRoot): Set<string> => {
	const remembered = basenames.get(root);

	if (remembered !== undefined) return remembered;

	const found = new Set<string>();

	const walk = (directory: string): void => {
		for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
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
 * A prompt may point at something that is not committed — a gitignored
 * directory of working notes, say, which is a local copy rather than part of
 * the checkout. On the machine that wrote the sentence the file
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
 * @param root The repository root.
 * @param references The paths that did not resolve on disk.
 * @returns The ones an ignore rule accounts for.
 */
export const ignoredIn = (root: string, references: string[]): Set<string> => {
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
 */
export interface Skill {
	directory: string;
	path: string;
	manifest: string | null;
	frontmatter: ReturnType<typeof frontmatterOf> | null;
	lines: number;
	files: string[];
}

/**
 * Reads every skill directory.
 *
 * @param [root] The repository root.
 * @returns The skills, ordered by directory name.
 */
export const skillsOf = (root: string = repositoryRoot): Skill[] => {
	const base = path.join(root, '.claude', 'skills');

	if (!exists(base)) return [];

	return fileSystem
		.readdirSync(base, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => {
			const directory = path.join(base, entry.name);
			const manifestPath = path.join(directory, 'SKILL.md');
			const manifest = exists(manifestPath) ? fileSystem.readFileSync(manifestPath, 'utf8') : null;

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
 */
export interface Rule {
	file: string;
	path: string;
	source: string;
	frontmatter: ReturnType<typeof frontmatterOf>;
}

/**
 * Reads every rule under `.claude/rules`, index excluded.
 *
 * @param [root] The repository root.
 * @returns The rules, ordered by file name.
 */
export const rulesOf = (root: string = repositoryRoot): Rule[] => {
	const base = path.join(root, '.claude', 'rules');

	if (!exists(base)) return [];

	return fileSystem
		.readdirSync(base)
		.filter((file) => file.endsWith('.md') && file !== 'README.md')
		.sort()
		.map((file) => {
			const full = path.join(base, file);
			const source = fileSystem.readFileSync(full, 'utf8');

			return { file, path: full, source, frontmatter: frontmatterOf(source) };
		});
};

/**
 * One rule fixture, as read from `tools/claude/rule-fixtures`.
 *
 */
export interface RuleFixture {
	file: string;
	path: string;
	document: Record<string, unknown> | null;
	problem: string | null;
}

/**
 * Reads every rule fixture.
 *
 * @param [root] The repository root.
 * @returns The fixtures, ordered by file name.
 */
export const ruleFixturesOf = (root: string = repositoryRoot): RuleFixture[] => {
	const base = path.join(root, 'tools', 'claude', 'rule-fixtures');

	if (!exists(base)) return [];

	return fileSystem
		.readdirSync(base)
		.filter((file) => file.endsWith('.fixture.json'))
		.sort()
		.map((file) => {
			const full = path.join(base, file);

			try {
				return {
					file,
					path: full,
					document: JSON.parse(fileSystem.readFileSync(full, 'utf8')),
					problem: null,
				};
			} catch (failure) {
				return { file, path: full, document: null, problem: String(failure) };
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
 */
export interface Evals {
	file: string;
	path: string;
	document: Record<string, unknown> | null;
	problem: string | null;
}

/**
 * Reads every eval suite.
 *
 * @param [root] The repository root.
 * @returns The suites, ordered by file name.
 */
export const evalsOf = (root: string = repositoryRoot): Evals[] => {
	const base = path.join(root, 'tools', 'claude', 'skill-evals');

	if (!exists(base)) return [];

	return fileSystem
		.readdirSync(base)
		.filter((file) => file.endsWith('.eval.json'))
		.sort()
		.map((file) => {
			const full = path.join(base, file);

			try {
				return {
					file,
					path: full,
					document: JSON.parse(fileSystem.readFileSync(full, 'utf8')),
					problem: null,
				};
			} catch (failure) {
				return {
					file,
					path: full,
					document: null,
					problem: String(failure),
				};
			}
		});
};

/**
 * Reads a settings file, if it is there.
 *
 * @param root The repository root.
 * @param name `settings.json` or `settings.local.json`.
 * @returns The settings.
 */
export const settingsOf = (
	root: string,
	name: string,
): {
	name: string;
	path: string;
	present: boolean;
	document: Record<string, unknown> | null;
	problem: string | null;
} => {
	const full = path.join(root, '.claude', name);

	if (!exists(full)) {
		return { name, path: full, present: false, document: null, problem: null };
	}

	try {
		return {
			name,
			path: full,
			present: true,
			document: JSON.parse(fileSystem.readFileSync(full, 'utf8')),
			problem: null,
		};
	} catch (failure) {
		return {
			name,
			path: full,
			present: true,
			document: null,
			problem: String(failure),
		};
	}
};

/**
 * The scripts declared by the root `package.json`.
 *
 * @param [root] The repository root.
 * @returns The script names.
 */
export const scriptsOf = (root: string = repositoryRoot): Set<string> => {
	const manifest = path.join(root, 'package.json');

	if (!exists(manifest)) return new Set();

	const document = JSON.parse(fileSystem.readFileSync(manifest, 'utf8'));

	return new Set(Object.keys(document.scripts ?? {}));
};

/**
 * One subagent as it sits on disk.
 *
 */
export interface Agent {
	file: string;
	path: string;
	frontmatter: ReturnType<typeof frontmatterOf>;
}

/**
 * Reads every subagent under `.claude/agents`.
 *
 * A tree without the directory answers with nothing rather than throwing: an
 * agent is optional, and the checks over the ones that exist run either way.
 *
 * @param [root] The repository root.
 * @returns The agents, ordered by file name.
 */
export const agentDefinitionsOf = (root: string = repositoryRoot): Agent[] => {
	const base = path.join(root, '.claude', 'agents');

	if (!exists(base)) return [];

	return fileSystem
		.readdirSync(base)
		.filter((file) => file.endsWith('.md'))
		.sort()
		.map((file) => {
			const full = path.join(base, file);

			return {
				file,
				path: full,
				frontmatter: frontmatterOf(fileSystem.readFileSync(full, 'utf8')),
			};
		});
};

/**
 * The subagents declared under `.claude/agents`.
 *
 * @param [root] The repository root.
 * @returns The agent names, without the `.md`.
 */
export const agentsOf = (root: string = repositoryRoot): Set<string> => {
	return new Set(agentDefinitionsOf(root).map((agent) => agent.file.replace(/\.md$/, '')));
};
