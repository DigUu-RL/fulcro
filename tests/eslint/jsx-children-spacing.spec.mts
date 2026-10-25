import { Linter } from 'eslint';
import typescriptEslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { jsxChildrenSpacing } from '@/tools/eslint/jsx-children-spacing.mts';

/**
 * Suite for the `local/jsx-children-spacing` rule.
 *
 * Children follow the rule of statements: one spanning more than one line is
 * set apart by a blank line, and children on one line each follow each other
 * without one. Text mixed with elements flows as written.
 */

const linter = new Linter({ configType: 'flat' });

/** Configuration applying only this rule, to TSX. */
const CONFIG: Linter.Config[] = [
	{
		files: ['**/*.tsx'],
		languageOptions: {
			parser: typescriptEslint.parser,
			parserOptions: { ecmaFeatures: { jsx: true } },
		},
		plugins: { local: { rules: { 'jsx-children-spacing': jsxChildrenSpacing } } },
		rules: { 'local/jsx-children-spacing': 'error' },
	},
];

/**
 * Lints one source.
 *
 * @param code The source.
 * @returns The message ids the rule reported, in order.
 */
const reported = (code: string): string[] => {
	return linter
		.verify(code, CONFIG, { filename: 'view.tsx' })
		.map((message) => message.messageId ?? message.message);
};

describe('local/jsx-children-spacing refuses', () => {
	it('a child spanning lines with no blank line before the next', () => {
		const code =
			'const view = (\n\t<ul>\n\t\t<li>\n\t\t\tone\n\t\t</li>\n\t\t<li>two</li>\n\t</ul>\n);';

		expect(reported(code)).toEqual(['requireBlankLine']);
	});

	it('a blank line between children that fit on one line', () => {
		const code = 'const view = (\n\t<ul>\n\t\t<li>one</li>\n\n\t\t<li>two</li>\n\t</ul>\n);';

		expect(reported(code)).toEqual(['forbidBlankLine']);
	});

	it('and fixes the spacing', () => {
		const code = 'const view = (\n\t<ul>\n\t\t<li>one</li>\n\n\t\t<li>two</li>\n\t</ul>\n);';

		expect(linter.verifyAndFix(code, CONFIG, { filename: 'view.tsx' }).output).toBe(
			'const view = (\n\t<ul>\n\t\t<li>one</li>\n\t\t<li>two</li>\n\t</ul>\n);',
		);
	});
});

describe('local/jsx-children-spacing allows', () => {
	it.each([
		[
			'one-line children in a row',
			'const view = (\n\t<ul>\n\t\t<li>one</li>\n\t\t<li>two</li>\n\t</ul>\n);',
		],
		[
			'a child spanning lines set apart',
			'const view = (\n\t<ul>\n\t\t<li>\n\t\t\tone\n\t\t</li>\n\n\t\t<li>two</li>\n\t</ul>\n);',
		],
		['text mixed with elements', 'const view = <p>\n\tRead <a>this</a>\n\tfirst.\n</p>;'],
	])('%s', (_label, code) => {
		expect(reported(code)).toEqual([]);
	});
});
