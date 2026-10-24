/**
 * What a validator produces, and how it reaches a terminal.
 *
 * A finding is data, not a printed line: the validators are called by their
 * tests as functions and asked what they found, and only the command line
 * turns that into text and an exit code. A checker that could only print would
 * be a checker whose own tests had to scrape its output.
 *
 * Two levels, and the difference is deliberate. An **error** is something
 * broken now — a reference to a file that is not there, a frontmatter key
 * Claude Code will ignore, a name that shadows a built-in command. CI fails on
 * those. A **warning** is a gap against the standard in
 * `.claude/skills/skill-authoring/SKILL.md` that no run can prove is a defect:
 * a missing eval case, a skill longer than the guidance. Those are printed on
 * every run and fail only under `--strict`, so that a skill written before the
 * standard existed is visible without holding the repository hostage.
 */

/**
 * One thing a validator found.
 *
 */
export type Finding = {
	level: 'error' | 'warning';
	rule: string;
	where: string;
	message: string;
};

/**
 * Records an error.
 *
 * @param rule Short identifier of the check that failed.
 * @param where Repository-relative path, or a path and a key.
 * @param message What is wrong, in one sentence.
 * @returns The finding.
 */
export const error = (rule: string, where: string, message: string): Finding => {
	return {
		level: 'error',
		rule,
		where,
		message,
	};
};

/**
 * Records a warning.
 *
 * @param rule Short identifier of the check that was not met.
 * @param where Repository-relative path, or a path and a key.
 * @param message What is missing, in one sentence.
 * @returns The finding.
 */
export const warning = (rule: string, where: string, message: string): Finding => {
	return {
		level: 'warning',
		rule,
		where,
		message,
	};
};

/**
 * Prints findings and answers with the exit code they earn.
 *
 * @param title What was validated.
 * @param findings Everything found, in any order.
 * @param options `strict` fails on warnings too.
 * @returns The process exit code.
 */
export const report = (
	title: string,
	findings: Finding[],
	options: { strict?: boolean } = {},
): number => {
	const errors = findings.filter((finding) => finding.level === 'error');
	const warnings = findings.filter((finding) => finding.level === 'warning');

	const write = (line: string): void => {
		process.stdout.write(`${line}\n`);
	};

	if (findings.length === 0) {
		write(`${title}: nothing to report.`);

		return 0;
	}

	for (const level of ['error', 'warning']) {
		const group = level === 'error' ? errors : warnings;

		if (group.length === 0) continue;

		write('');
		write(`${level === 'error' ? 'Errors' : 'Warnings'} (${group.length}):`);

		for (const finding of group) {
			write(`  ${finding.where}`);
			write(`    [${finding.rule}] ${finding.message}`);
		}
	}

	write('');
	write(`${title}: ${errors.length} error(s), ${warnings.length} warning(s).`);

	if (errors.length > 0) return 1;
	if (options.strict === true && warnings.length > 0) return 1;

	return 0;
};
