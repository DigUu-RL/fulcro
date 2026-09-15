import eslintConfigPrettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
	{
		ignores: ['**/dist/**', '**/node_modules/**'],
	},

	{
		plugins: {
			'simple-import-sort': simpleImportSort,
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
		},
	},

	eslintConfigPrettier,
];
