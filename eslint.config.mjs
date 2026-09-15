import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import typescriptEslint from 'typescript-eslint';

/**
 * Braces on any branch that does not fit on one line.
 *
 * ESLint's own `curly` has no setting for this. `multi-line` only complains
 * once the body itself wraps, which leaves the far more common shape
 *
 *     if (condition)
 *         doSomething();
 *
 * unreported — and that is precisely the shape where a second statement gets
 * added later, indented to match, and runs unconditionally. `all` would catch
 * it and also outlaw `if (condition) return;`, which is worth keeping.
 *
 * So the rule is stated exactly: braces are optional only while the whole
 * statement sits on a single line.
 */
const braceWrappedBranches = {
	meta: {
		type: 'problem',
		fixable: 'code',
		schema: [],
		messages: {
			needed:
				'A branch spanning more than one line needs braces; only a branch written entirely on one line may omit them.',
		},
	},

	create(context) {
		/**
		 * Reports a branch whose body starts on a later line than its keyword.
		 *
		 * @param {object} start Node the branch begins at.
		 * @param {object} body Statement the branch runs.
		 */
		const check = (start, body) => {
			if (body === null || body === undefined) return;
			if (body.type === 'BlockStatement') return;

			// An `else if` is a branch of its own and is reported there.
			if (body.type === 'IfStatement') return;
			if (start.loc.start.line === body.loc.end.line) return;

			context.report({
				node: body,
				messageId: 'needed',
				fix: (fixer) => [
					fixer.insertTextBefore(body, '{'),
					fixer.insertTextAfter(body, '}'),
				],
			});
		};

		return {
			IfStatement(node) {
				check(node, node.consequent);

				if (node.alternate !== null) {
					const elseToken = context.sourceCode.getTokenBefore(node.alternate);

					check(elseToken, node.alternate);
				}
			},
			ForStatement: (node) => check(node, node.body),
			ForOfStatement: (node) => check(node, node.body),
			ForInStatement: (node) => check(node, node.body),
			WhileStatement: (node) => check(node, node.body),
		};
	},
};

export default [
	{
		ignores: ['**/dist/**', '**/node_modules/**'],
	},

	{
		// Flat config applies a block with no `files` only to .js, .mjs and .cjs.
		// Without this line every TypeScript file in the repository was skipped,
		// and `eslint .` inspected exactly one file: this one.
		files: ['**/*.{ts,mts,cts,js,mjs,cjs}'],

		languageOptions: {
			// TypeScript syntax is a parse error to the default parser, so a file
			// would be reported as broken rather than linted.
			parser: typescriptEslint.parser,
			ecmaVersion: 'latest',
			sourceType: 'module',
		},

		plugins: {
			'simple-import-sort': simpleImportSort,
			local: { rules: { 'brace-wrapped-branches': braceWrappedBranches } },
		},

		rules: {
			'simple-import-sort/imports': [
				'error',
				{
					// Widening outwards: the platform, then third parties, then the
					// sibling packages of the workspace, then the package being read,
					// then its neighbours. A reader following an import list top to
					// bottom therefore moves steadily closer to the file in hand.
					groups: [
						['^node:'],
						['^@?\\w'],
						['^@fulcro/'],
						['^@/'],
						['^\\.\\./'],
						['^\\./'],
					],
				},
			],
			'simple-import-sort/exports': 'error',

			'local/brace-wrapped-branches': 'error',
		},
	},

	eslintConfigPrettier,
];
