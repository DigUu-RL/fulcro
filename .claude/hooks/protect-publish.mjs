/**
 * Pushing, publishing and merging stay with a human.
 *
 * `.claude/CLAUDE.md` says so, and until this hook existed that was a sentence
 * a model had to remember at the end of a long session. The three operations
 * share one property: they are the ones this repository cannot take back.
 * A bad commit is amended, a bad build is rebuilt, but a version on npm is
 * permanent and a branch pushed to `main` has already run the release.
 *
 * `.claude/rules/protected-operations.md` says how a human performs each of
 * them, and how one is re-opened for a session that genuinely needs it.
 */

import { pathToFileURL } from 'node:url';

import { commandsOf, invocationOf, runs } from './command-line.mjs';
import { exceptions, guard } from './hook.mjs';

/**
 * How a refusal reads to the model that tripped it.
 *
 * @param {string} operation What was attempted.
 * @param {string} instead What to do about it.
 * @returns {string} The message handed back.
 */
const refusal = (operation, instead) =>
	[
		`Blocked by .claude/hooks/protect-publish.mjs: ${operation}.`,
		instead,
		'See .claude/rules/protected-operations.md. Do not look for another way to run it.',
	].join(' ');

/**
 * The operations this hook refuses.
 *
 * Each carries the identifier a human writes into `FULCRO_HOOKS_ALLOW` to
 * re-open it for one session.
 */
const RULES = [
	{
		id: 'push',
		patterns: [['git', 'push']],
		reason: refusal(
			'this repository is never pushed from a Claude Code session',
			'Commit the work and say it is ready; the human pushes.',
		),
	},
	{
		id: 'publish',
		patterns: [
			['npm', 'publish'],
			['pnpm', 'publish'],
			['yarn', 'publish'],
			['bun', 'publish'],
			['changeset', 'publish'],
			['npm', 'run', 'release'],
		],
		reason: refusal(
			'packages are published from `main` by the release workflow, never from a session',
			'Record the change with `npm run changeset` and stop there.',
		),
	},
	{
		// `git merge` is not in here. Merging `main` back into `dev` is
		// ordinary work on a working branch; what is protected is the moment a
		// pull request lands on the release branch.
		id: 'merge',
		patterns: [['gh', 'pr', 'merge']],
		reason: refusal(
			'work reaches `main` through a pull request a human merges',
			'Open or update the pull request and leave the merge to the human.',
		),
	},
];

/**
 * Reviews one command line.
 *
 * @param {{ command?: unknown }} input The `tool_input` of the hook event.
 * @returns {string | null} The reason the call is refused, or `null`.
 */
export const review = (input) => {
	if (typeof input.command !== 'string') return null;

	const allowed = exceptions();
	const invocations = commandsOf(input.command).map(invocationOf);

	for (const rule of RULES) {
		if (allowed.has(rule.id)) continue;

		const tripped = invocations.some((invocation) =>
			rule.patterns.some((pattern) => runs(invocation, pattern)),
		);

		if (tripped) return rule.reason;
	}

	return null;
};

// Run as a hook, imported by its tests. The comparison is on the resolved URL
// rather than on the file name, so a test importing this module never spawns
// the guard and never calls `process.exit`.
if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void guard(review);
}
