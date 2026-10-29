import { Linter } from 'eslint';
import typescriptEslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { requireBracesForMultilineArrowBody } from '@/tools/eslint/require-braces-for-multiline-arrow-body.mts';

/**
 * Suite for the `local/require-braces-for-multiline-arrow-body` rule.
 *
 * An arrow function may leave its braces out only while the whole function
 * fits on one line; both halves of that are asserted.
 */

const linter = new Linter({ configType: 'flat' });

/**
 * Lints one source.
 *
 * @param code The source.
 * @returns How many times the rule reported.
 */
const reports = (code: string): number => {
	return linter.verify(
		code,
		[
			{
				files: ['**/*.ts'],
				languageOptions: { parser: typescriptEslint.parser },
				plugins: {
					local: {
						rules: {
							'require-braces-for-multiline-arrow-body': requireBracesForMultilineArrowBody,
						},
					},
				},
				rules: { 'local/require-braces-for-multiline-arrow-body': 'error' },
			},
		],
		{ filename: 'source.ts' },
	).length;
};

describe('local/require-braces-for-multiline-arrow-body refuses', () => {
	it('an expression body continued on the next line', () => {
		expect(reports('const add = (left, right) =>\n\tleft + right;')).toBe(1);
	});

	it('an object returned across lines', () => {
		expect(reports('const make = () => ({\n\tready: true,\n});')).toBe(1);
	});
});

describe('local/require-braces-for-multiline-arrow-body allows', () => {
	it.each([
		['an expression body on one line', 'const add = (left, right) => left + right;'],
		['a block body across lines', 'const add = (left, right) => {\n\treturn left + right;\n};'],
	])('%s', (_label, code) => {
		expect(reports(code)).toBe(0);
	});
});
