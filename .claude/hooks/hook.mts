/**
 * The half of a hook that talks to Claude Code.
 *
 * Claude Code writes the event to standard input as JSON and reads the verdict
 * from the exit code: zero lets the call through to the ordinary permission
 * prompt, two refuses it and hands whatever went to standard error back to the
 * model. Every other code is a broken hook, and a broken hook must not be a
 * blocked repository — so anything unexpected in here exits zero.
 *
 * Keeping this apart from the guards themselves is what makes the guards
 * testable: a rule is a function from a command line to a reason, and a test
 * calls it directly rather than spawning a process and reading exit codes.
 */

import { text } from 'node:stream/consumers';

/**
 * Operations a human has deliberately re-opened for this session.
 *
 * The variable is read from the environment of the hook process, which is the
 * environment Claude Code itself was started in. Claude cannot set it — not by
 * exporting it, not by writing a settings file, not by asking — because the
 * hook is spawned afresh from the session's own environment. Re-opening an
 * operation therefore means a human closing the session and starting it again
 * with the exception written out, which is the deliberate act the exception is
 * supposed to be.
 *
 * @returns The rule identifiers that are allowed through.
 */
export const exceptions = (): Set<string> => {
	return new Set(
		(process.env.FULCRO_HOOKS_ALLOW ?? '')
			.split(/[,\s]+/)
			.filter((entry) => entry !== '')
			.map((entry) => entry.toLowerCase()),
	);
};

/**
 * Reads the hook event from standard input.
 *
 * @returns The event, or `null` if it cannot be read.
 */
const event = async (): Promise<object | null> => {
	const received = await text(process.stdin);

	try {
		const parsed: unknown = JSON.parse(received);

		return typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
};

/**
 * Runs a guard over the tool call Claude Code is about to make.
 *
 * @param review Returns the reason the call
 *   is refused, or `null` to let it through.
 * @returns Resolves once the process has been told to exit.
 */
export const guard = async (review: (input: object) => string | null): Promise<void> => {
	const received = await event();
	const input: unknown =
		received !== null && 'tool_input' in received ? received.tool_input : undefined;

	if (input === null || typeof input !== 'object') {
		process.exit(0);
	}

	let refusal: string | null = null;

	try {
		refusal = review(input);
	} catch (error) {
		// A guard that throws is a bug in the guard, and the bug is worth
		// seeing — but on standard output, where it reaches the transcript
		// without being read as a refusal.
		process.stdout.write(`A repository hook failed to run: ${String(error)}\n`);
		process.exit(0);
	}

	if (refusal === null) {
		process.exit(0);
	}

	process.stderr.write(`${refusal}\n`);
	process.exit(2);
};
