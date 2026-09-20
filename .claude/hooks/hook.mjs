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
 * @returns {Set<string>} The rule identifiers that are allowed through.
 */
export const exceptions = () =>
	new Set(
		(process.env.FULCRO_HOOKS_ALLOW ?? '')
			.split(/[,\s]+/)
			.filter((entry) => entry !== '')
			.map((entry) => entry.toLowerCase()),
	);

/**
 * Reads the hook event from standard input.
 *
 * @returns {Promise<object | null>} The event, or `null` if it cannot be read.
 */
const event = async () => {
	const chunks = [];

	for await (const chunk of process.stdin) {
		chunks.push(chunk);
	}

	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'));
	} catch {
		return null;
	}
};

/**
 * Runs a guard over the tool call Claude Code is about to make.
 *
 * @param {(input: object) => string | null} review Returns the reason the call
 *   is refused, or `null` to let it through.
 * @returns {Promise<void>} Resolves once the process has been told to exit.
 */
export const guard = async (review) => {
	const received = await event();
	const input = received?.tool_input;

	if (input === null || typeof input !== 'object') {
		process.exit(0);
	}

	let refusal = null;

	try {
		refusal = review(input);
	} catch (error) {
		// A guard that throws is a bug in the guard, and the bug is worth
		// seeing — but on standard output, where it reaches the transcript
		// without being read as a refusal.
		process.stdout.write(`A repository hook failed to run: ${error}\n`);
		process.exit(0);
	}

	if (refusal === null) {
		process.exit(0);
	}

	process.stderr.write(`${refusal}\n`);
	process.exit(2);
};
