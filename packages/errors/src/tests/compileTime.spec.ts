import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Compile-time suite.
 *
 * Half of what this package promises is kept by the type system: an
 * unregistered code, a value of the wrong type, and a code declared outside its
 * package's range are compile errors, not runtime surprises. A fixture that
 * must not compile is checked by both compilers the repository supports, and
 * each mistake in it has to be reported on its own line.
 *
 * Driven through the `tsc` binary, as `@fulcro/functions`' exhaustiveness suite
 * is, because TypeScript 7 no longer exposes a compiler API.
 */

/**
 * Project holding only the fixture. A project rather than a bare file, because
 * the sources the fixture reaches import each other through the package's `@/`
 * alias, and only a tsconfig declares it.
 */
const PROJECT_PATH = path.resolve(__dirname, 'rejected.tsconfig.json');

/** Root of the workspace, where the compilers are installed. */
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

/** The compilers, as the package each is installed under. */
const COMPILERS = [
	['TypeScript 5', 'typescript'],
	['TypeScript 7', 'typescript7'],
] as const;

/**
 * Type checks the fixture.
 *
 * @param packageName Package the compiler is installed under.
 * @returns Everything the compiler printed.
 */
const errorsFrom = (packageName: string): string => {
	const tsc: string = path.join(
		WORKSPACE_ROOT,
		'node_modules',
		packageName,
		'bin',
		'tsc',
	);

	try {
		execFileSync(
			process.execPath,
			[tsc, '--pretty', 'false', '-p', PROJECT_PATH],
			{
				cwd: WORKSPACE_ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		return '';
	} catch (failure) {
		const { stdout, stderr } = failure as { stdout?: string; stderr?: string };

		return `${stdout ?? ''}${stderr ?? ''}`;
	}
};

/**
 * The fixture lines the compiler reported an error on.
 *
 * @param report What the compiler printed.
 * @returns The one-based line numbers, in order, without repeats.
 */
const reportedLines = (report: string): number[] => [
	...new Set(
		[...report.matchAll(/rejected\.fixture\.ts[:(](\d+)/g)].map((match) =>
			Number(match[1]),
		),
	),
];

describe.each(COMPILERS)(
	'createError at compile time, on %s',
	(_label, name) => {
		const report: string = errorsFrom(name);
		const lines: number[] = reportedLines(report);

		it('should refuse an unregistered code', () => {
			expect(lines).toContain(13);
		});

		it('should refuse a value of the wrong type', () => {
			expect(lines).toContain(16);
		});

		it('should refuse a template given too few values', () => {
			expect(lines).toContain(19);
		});

		it('should refuse a code declared outside its range', () => {
			expect(lines).toContain(23);
		});

		it('should report nothing else', () => {
			expect(lines).toEqual([13, 16, 19, 23]);
		});
	},
);
