/**
 * Commands that throw work away rather than change it.
 *
 * The three shapes in here are not dangerous because they are powerful; they
 * are dangerous because what they destroy was never written down anywhere
 * else. `git reset --hard` takes uncommitted work, `git clean -fd` takes
 * untracked files — which in this repository includes the worker fixtures that
 * are source, not output — and a recursive delete aimed at the checkout takes
 * the repository with it.
 *
 * Nothing here refuses a narrow deletion. `rm -rf dist` and `rm -rf
 * node_modules` are ordinary and stay ordinary: the test is whether the target
 * resolves to the working directory or above it.
 *
 * `.claude/rules/protected-operations.md` says how a human performs each of
 * these, and how one is re-opened for a session that genuinely needs it.
 */

import { pathToFileURL } from 'node:url';

import {
	commandsOf,
	deletionTargets,
	hasFlag,
	invocationOf,
	isRepositoryWide,
	runs,
} from './command-line.mjs';
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
		`Blocked by .claude/hooks/block-destructive.mjs: ${operation}.`,
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
		id: 'reset-hard',
		refuses: (invocation) =>
			runs(invocation, ['git', 'reset']) && hasFlag(invocation, '--hard'),
		reason: refusal(
			'`git reset --hard` discards uncommitted work with no way back',
			'Name what should be undone and undo that: `git restore` a path, `git stash`, or a plain `git reset` that keeps the files.',
		),
	},
	{
		id: 'clean',
		refuses: (invocation) =>
			runs(invocation, ['git', 'clean']) && hasFlag(invocation, '--force', 'f'),
		reason: refusal(
			'`git clean --force` deletes untracked files, and some untracked files here are source',
			'Delete the paths you mean by name, after `git clean -n` has said what would go.',
		),
	},
	{
		id: 'delete-tree',
		refuses: (invocation) => deletionTargets(invocation).some(isRepositoryWide),
		reason: refusal(
			'this deletes the checkout, a home directory or a filesystem root',
			'Delete a path inside the repository by name — `dist` and `node_modules` are fine.',
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
		if (invocations.some(rule.refuses)) return rule.reason;
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
