/**
 * One cheap check after an edit, and only one.
 *
 * The temptation with a post-edit hook is to run the suite. Do not: it would
 * cost minutes on every edit and flood the transcript with output nobody
 * reads. What belongs here is the check that costs nothing and that a later
 * command would otherwise report as something else entirely.
 *
 * That check is `.claude/rules/build-output.md`. A `.js` or `.d.ts` written
 * beside a `.ts` in a package's `src` is a misconfigured `rootDir`, but the
 * failure it causes reads as a broken import, hours later, because the runner
 * resolves the stale file in preference to the source. It is also invisible in
 * `git status`, since those extensions are ignored there on purpose.
 *
 * The hook reports; it never fixes and never deletes. The fix is the tsconfig,
 * and a hook that quietly removed the file would hide the bug it exists to
 * expose.
 */

import { pathToFileURL } from 'node:url';

import { guard } from './hook.mjs';

/** Extensions that are emitted output rather than source. */
const EMITTED = /\.(js|mjs|cjs|d\.ts|d\.mts|d\.cts)$/;

/**
 * Reviews the file an edit has just written.
 *
 * @param {{ file_path?: unknown }} input The `tool_input` of the hook event.
 * @returns {string | null} The reason the write is reported, or `null`.
 */
export const review = (input) => {
	if (typeof input.file_path !== 'string') return null;

	// Both separators, not the one this machine happens to use. The rule is
	// about where a file sits in the repository, and the answer must not change
	// with the platform reading the path — CI runs Windows and Linux both.
	const file = input.file_path.replace(/\\/g, '/');

	if (!/(^|\/)packages\/[^/]+\/src\//.test(file)) return null;
	if (!EMITTED.test(file)) return null;

	// A fixture is source, and `@fulcro/parallel` needs real JavaScript on disk
	// for a worker to import at runtime. That exception is a directory, not an
	// extension — which is the whole reason it is written down.
	if (/(^|\/)fixtures\//.test(file)) return null;

	return [
		`.claude/hooks/post-edit-check.mjs: ${file} is emitted output sitting beside its source.`,
		'If a build wrote it, the `rootDir`/`outDir` pair of that package is the bug — fix the tsconfig rather than deleting the file.',
		'If you wrote it deliberately and it is a fixture, it belongs in a `fixtures/` directory.',
		'See .claude/rules/build-output.md.',
	].join(' ');
};

// Run as a hook, imported by its tests.
if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	void guard(review);
}
