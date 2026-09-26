import * as path from 'node:path';

import { Linter } from 'eslint';
import typescriptEslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import {
	codedErrors,
	PACKAGE_RANGES,
} from '../../tools/eslint/coded-errors.mjs';

/**
 * Suite for the `local/coded-errors` rule.
 *
 * Both halves, as for every guard in this repository: what it refuses, and what
 * it has to keep allowing — a rule that fired on a rethrow would be switched
 * off within a day, and would then protect nothing.
 *
 * The files are linted in memory under paths that name a package, because the
 * package a file lives in is what decides the range its codes must come from.
 */

const linter = new Linter({ configType: 'flat' });

/**
 * Lints one source as if it lived at a path.
 *
 * @param code The source.
 * @param filename Where it lives, relative to the repository.
 * @returns The message ids the rule reported, in order.
 */
const reported = (code: string, filename: string): string[] =>
	linter
		.verify(
			code,
			[
				{
					files: ['**/*.ts'],
					languageOptions: { parser: typescriptEslint.parser },
					plugins: { local: { rules: { 'coded-errors': codedErrors } } },
					rules: { 'local/coded-errors': 'error' },
				},
			],
			{ filename },
		)
		.map((message) => message.messageId ?? message.message);

/** A file inside `@fulcro/types`, whose range is 6. */
const TYPES_FILE = 'packages/types/src/decimal/index.ts';

describe('local/coded-errors refuses', () => {
	it.each([
		'Error',
		'TypeError',
		'RangeError',
		'SyntaxError',
		'AggregateError',
	])('a new %s', (name) => {
		expect(reported(`throw new ${name}('text');`, TYPES_FILE)).toEqual([
			'constructed',
		]);
	});

	it('an error constructed without being thrown', () => {
		expect(reported(`reject(new Error('lost its way'));`, TYPES_FILE)).toEqual([
			'constructed',
		]);
	});

	it('a thrown string, plain or templated', () => {
		expect(reported(`throw 'text';`, TYPES_FILE)).toEqual(['thrownText']);
		expect(reported('throw `text ${1}`;', TYPES_FILE)).toEqual(['thrownText']);
	});

	it("a code from another package's range", () => {
		expect(reported(`throw createError('FULCRO1001');`, TYPES_FILE)).toEqual([
			'otherRange',
		]);
	});

	it('a code in a package that has no range yet', () => {
		expect(
			reported(
				`throw createError('FULCRO7001');`,
				'packages/newcomer/src/index.ts',
			),
		).toEqual(['noRange']);
	});

	it("the same on an absolute path, in the platform's separators", () => {
		// Backslashes on Windows, forward slashes elsewhere; CI runs both, which
		// is what covers the two spellings.
		expect(
			reported(
				`throw createError('FULCRO1001');`,
				path.join(process.cwd(), 'packages', 'types', 'src', 'index.ts'),
			),
		).toEqual(['otherRange']);
	});
});

describe('local/coded-errors allows', () => {
	it("a code from the file's own range", () => {
		expect(
			reported(
				`throw createError('FULCRO6021', 'Vector3.from', 'x');`,
				TYPES_FILE,
			),
		).toEqual([]);
	});

	it('a caught error, thrown again', () => {
		expect(
			reported(`try { run(); } catch (error) { throw error; }`, TYPES_FILE),
		).toEqual([]);
	});

	it('an error placed in a wider context', () => {
		expect(
			reported(`throw prefixError(error, 'Outer.from');`, TYPES_FILE),
		).toEqual([]);
	});

	it('a code the types narrowed, passed through a variable', () => {
		expect(reported(`throw createError(code, reason);`, TYPES_FILE)).toEqual(
			[],
		);
	});

	it('a class whose name only resembles an error', () => {
		expect(reported(`const x = new ErrorBoundary();`, TYPES_FILE)).toEqual([]);
	});
});

describe('the ranges', () => {
	it('should give every package one digit, and no digit twice', () => {
		const digits: string[] = Object.values(PACKAGE_RANGES);

		expect(new Set(digits).size).toBe(digits.length);
		expect(PACKAGE_RANGES).toEqual({
			collections: '1',
			functions: '2',
			parallel: '3',
			reflect: '4',
			'transform-core': '5',
			types: '6',
		});
	});
});
