import javascript from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import typescriptEslint from 'typescript-eslint';

// Relative on purpose, here and in the rules: ESLint loads this file with plain Node, which knows nothing of the
// `@/` alias. The exception to `no-restricted-imports` below covers exactly the files Node runs that way.
import { braceWrappedBranches } from './tools/eslint/brace-wrapped-branches.mts';
import { codedErrors } from './tools/eslint/coded-errors.mts';
import { jsxChildrenSpacing } from './tools/eslint/jsx-children-spacing.mts';
import { requireBracesForMultilineArrowBody } from './tools/eslint/require-braces-for-multiline-arrow-body.mts';

// midnight-indigo-ui's configuration, to the letter, plus Fulcro's two rules of its own (`coded-errors`,
// `brace-wrapped-branches`) and the exceptions it needs, each stated where it applies.

// Statements spanning more than one line are always set apart from their neighbors by blank lines.
const multilineStatements: string[] = [
	'multiline-block-like',
	'multiline-const',
	'multiline-let',
	'multiline-expression',
];

export default defineConfig(
	{
		ignores: [
			'**/dist/**',
			'**/node_modules/**',
			'**/coverage/**',
			// Consumer code the transformer and type suites compile as their input. Some assert the line a diagnostic
			// lands on, and some are written in exactly the shape the house style forbids, to prove it is handled.
			'**/*.sample.ts',
			'**/*.fixture.ts',
			'**/fixtures/**',
			'**/*.declared.d.ts',
		],
	},
	javascript.configs.recommended,
	typescriptEslint.configs.strictTypeChecked,
	typescriptEslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			'@stylistic': stylistic,
			local: {
				rules: {
					'brace-wrapped-branches': braceWrappedBranches,
					'coded-errors': codedErrors,
					'jsx-children-spacing': jsxChildrenSpacing,
					'require-braces-for-multiline-arrow-body': requireBracesForMultilineArrowBody,
				},
			},
		},
		rules: {
			// Type usage: explicit types and type-only imports/exports.
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/consistent-type-exports': 'error',
			'@typescript-eslint/explicit-function-return-type': 'error',
			'@typescript-eslint/explicit-module-boundary-types': 'error',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-floating-promises': [
				'error',
				{
					allowForKnownSafeCalls: [
						{ from: 'package', package: 'node:test', name: ['test', 'describe', 'it', 'suite'] },
					],
				},
			],

			// Functions: arrow functions by default; `function` only when strictly necessary.
			'func-style': ['error', 'expression'],
			'prefer-arrow-callback': 'error',

			// Control flow: avoid `else` (object calisthenics); braces unless the statement fits on one line.
			'no-else-return': ['error', { allowElseIf: false }],
			'no-lonely-if': 'error',
			'no-restricted-syntax': [
				'error',
				{
					selector: 'IfStatement[alternate]',
					message: 'Avoid `else`: prefer early returns or a ternary expression.',
				},
			],
			curly: ['error', 'multi-line', 'consistent'],

			// Naming: full, descriptive identifiers instead of abbreviations. `is` and `as` are Fulcro's on top of
			// midnight-indigo-ui's list: they are published names — `is<T>()` and `as<T>()` in @fulcro/reflect, whose
			// transformer recognises them by name, and `Decimal.is` — and a published name is kept.
			'id-length': [
				'error',
				{ min: 3, properties: 'never', exceptions: ['_', 'id', 'to', 'x', 'y', 'z', 'is', 'as'] },
			],

			// A leading `_` marks a binding that exists to be discarded — a template parameter that only types an error's
			// details, the variable of a loop that drains a sequence, a `using` that exists to be disposed. JavaScript
			// has no form of those without a name, so the name says it is unused on purpose. Fulcro's, on top of
			// midnight-indigo-ui's configuration, in the spirit of the `_` exception `id-length` already makes.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
			],

			// Braces for anything spanning more than one line, including arrow function bodies.
			'local/require-braces-for-multiline-arrow-body': 'error',
			'local/brace-wrapped-branches': 'error',

			// Readability: short related statements may stay together; multi-line constructs are set apart.
			'@stylistic/padding-line-between-statements': [
				'error',
				{ blankLine: 'always', prev: 'import', next: '*' },
				{ blankLine: 'any', prev: 'import', next: 'import' },
				{ blankLine: 'always', prev: '*', next: multilineStatements },
				{ blankLine: 'always', prev: multilineStatements, next: '*' },
			],

			// Imports: never relative paths, which break when files move or are renamed. `@/` is the root of the
			// workspace (`paths` in its tsconfig) and code files go without an extension; another workspace is
			// imported by its package name.
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['./*', '../*', '.', '..', '#*'],
							message:
								'Import through the `@/` alias of the workspace (`@/src/...`, `@/tests/...`), or by package name.',
						},
						{
							regex: String.raw`^@/.*\.(ts|tsx)$`,
							message: 'Leave the extension out of imports of code files (`@/src/shared/index`).',
						},
					],
				},
			],

			// JSX children follow the rule of statements: a blank line around children spanning more than one line, none
			// between children that fit on one line.
			'local/jsx-children-spacing': 'error',
		},
	},
	{
		// The shipped sources only. A test builds whatever errors it needs to provoke a failure, and
		// `@fulcro/errors` is where the classes are constructed on everybody else's behalf.
		files: ['packages/*/src/**/*.{ts,mts,cts,js,mjs,cjs}'],
		ignores: [
			'packages/errors/src/**',
			'packages/*/src/**/tests/**',
			'packages/*/src/**/*.spec.ts',
		],
		rules: {
			'local/coded-errors': 'error',
		},
	},
	{
		// Run by plain Node outside npm — Claude Code spawns the hooks with `node`, and ESLint loads its own
		// configuration — so nothing resolves the `@/` alias for them. An `@/` import here would stop the guards
		// that refuse `git push` from loading at all.
		files: ['.claude/hooks/**', 'tools/claude/**', 'tools/eslint/**', 'eslint.config.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},
);
