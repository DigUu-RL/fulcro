import { Linter } from 'eslint';
import typescriptEslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { braceWrappedBranches } from '@/tools/eslint/brace-wrapped-branches.mts';

/**
 * Suite for the `local/brace-wrapped-branches` rule.
 *
 * Both halves: the branch it exists to catch — a body on the line after its
 * keyword, where a second statement added later runs unconditionally — and the
 * one-line branch it must keep allowing, or the rule would be switched off.
 */

const linter = new Linter({ configType: 'flat' });

/** Configuration applying only this rule. */
const CONFIG: Linter.Config[] = [
	{
		files: ['**/*.ts'],
		languageOptions: { parser: typescriptEslint.parser },
		plugins: { local: { rules: { 'brace-wrapped-branches': braceWrappedBranches } } },
		rules: { 'local/brace-wrapped-branches': 'error' },
	},
];

/**
 * Lints one source.
 *
 * @param code The source.
 * @returns How many times the rule reported.
 */
const reports = (code: string): number => {
	return linter.verify(code, CONFIG, { filename: 'source.ts' }).length;
};

describe('local/brace-wrapped-branches refuses', () => {
	it.each([
		['an if', 'if (ready)\n\trun();'],
		['an else', 'if (ready) run();\nelse\n\twait();'],
		['a for', 'for (let i = 0; i < 2; i++)\n\trun();'],
		['a for of', 'for (const item of items)\n\trun(item);'],
		['a for in', 'for (const key in table)\n\trun(key);'],
		['a while', 'while (ready)\n\trun();'],
	])('%s whose body is on the next line', (_label, code) => {
		expect(reports(code)).toBe(1);
	});

	it('and fixes it by wrapping the body in braces', () => {
		expect(
			linter.verifyAndFix('if (ready)\n\trun();', CONFIG, { filename: 'source.ts' }).output,
		).toBe('if (ready)\n\t{run();}');
	});
});

describe('local/brace-wrapped-branches allows', () => {
	it.each([
		['a branch on one line', 'if (ready) return;'],
		['a block', 'if (ready) {\n\trun();\n}'],
		['an else if, reported as a branch of its own', 'if (a) run();\nelse if (b) wait();'],
		['a loop on one line', 'for (const item of items) run(item);'],
	])('%s', (_label, code) => {
		expect(reports(code)).toBe(0);
	});
});
