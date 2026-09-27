import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * Compiles the fixtures that prove what this package refuses at compile time.
 *
 * Driven through each compiler's `tsc` binary rather than its API, because 7.x
 * no longer exposes one — `createProgram` and everything around it are gone from
 * its entry point. Running the binary is also simply what a consumer does.
 *
 * A fixture reaches this package by name, so both compilers check it against
 * the declarations the package publishes rather than against its source.
 */

/** Root of the workspace, where the compilers are installed. */
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

/**
 * The compilers this library is expected to produce good diagnostics on, as the
 * package each is installed under. 7.x sits under an alias so both can be.
 */
export const COMPILERS = [
	['TypeScript 5', 'typescript'],
	['TypeScript 7', 'typescript7'],
] as const;

/**
 * Type checks a fixture and returns whatever the compiler complained about.
 *
 * @param fixture File name of the fixture, beside this module.
 * @param packageName Package the compiler is installed under.
 * @returns Everything the compiler printed, which is empty on success.
 */
export const compileFixture = (
	fixture: string,
	packageName: string,
): string => {
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
			[
				tsc,
				'--noEmit',
				'--strict',
				'--target',
				'es2022',
				'--module',
				'node16',
				'--moduleResolution',
				'node16',
				'--skipLibCheck',
				path.resolve(__dirname, fixture),
			],
			{
				cwd: WORKSPACE_ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		return '';
	} catch (failure) {
		// tsc exits non-zero when it reports an error, and writes the report to
		// stdout rather than to stderr.
		const { stdout, stderr } = failure as { stdout?: string; stderr?: string };

		return `${stdout ?? ''}${stderr ?? ''}`;
	}
};

/**
 * The lines of a fixture the compiler reported an error on, each once, in
 * order.
 *
 * @param report What {@link compileFixture} returned.
 * @param fixture File name of the fixture.
 * @returns The line numbers, ascending.
 */
export const reportedLines = (report: string, fixture: string): number[] => [
	...new Set(
		[
			...report.matchAll(
				new RegExp(`${fixture.replaceAll('.', '\\.')}[:(](\\d+)`, 'g'),
			),
		].map((match) => Number(match[1])),
	),
];
