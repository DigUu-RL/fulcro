import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Exhaustiveness suite.
 *
 * The exhaustive form of `switchFor` does its work in the type system, so it is
 * exercised the only way that proves anything: a fixture is compiled and the
 * diagnostics are asserted on. Nothing here imports the fixture at runtime, and
 * it would not run if it did — it is written not to compile.
 *
 * The message is asserted, not only the failure. When no overload matches,
 * TypeScript reports one of them, and which one it picks depends on their order:
 * with the exhaustive overload ahead of the predicate ones, forgetting an enum
 * member produces a complaint about `SwitchCase`, pointing at the form the
 * caller was not using. The check keeps working while the feature stops being
 * usable — the sort of regression a test that only counted errors would wave
 * through.
 *
 * **Compiled by two TypeScripts, and that is the point.** 5.x picks a best
 * candidate to report and words the failure well whichever order the overloads
 * are in, so a suite running on it alone would pass while a consumer on 7.x read
 * something useless. 7.x reports the last overload, which is what makes the
 * order matter at all. Testing only the version this repository happens to build
 * with would have missed the whole thing.
 *
 * Both are driven through their `tsc` binary rather than their API, because 7.x
 * no longer exposes one — `createProgram` and everything around it are gone from
 * its entry point. Running the binary is also simply what a consumer does.
 *
 * The fixture reaches this package by name, so both compilers check against the
 * declarations it publishes rather than against its source.
 */

/** Fixture fed to the compilers. */
const FIXTURE_PATH = path.resolve(__dirname, 'exhaustive.fixture.ts');

/** Root of the workspace, where the compilers are installed. */
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');

/**
 * The compilers this library is expected to produce good diagnostics on, as the
 * package each is installed under. 7.x sits under an alias so both can be.
 */
const COMPILERS = [
	['TypeScript 5', 'typescript'],
	['TypeScript 7', 'typescript7'],
] as const;

/**
 * Type checks the fixture and returns whatever the compiler complained about.
 *
 * @param packageName Package the compiler is installed under.
 * @returns Everything the compiler printed, which is empty on success.
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
				FIXTURE_PATH,
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

describe.each(COMPILERS)(
	'switchFor exhaustiveness, on %s',
	(_label, packageName) => {
		const reported: string = errorsFrom(packageName);

		it('should reject a call that leaves a member unhandled', () => {
			expect(reported).not.toBe('');
		});

		it('should blame the exhaustive form rather than the predicate one', () => {
			// The whole diagnostic hangs on this. `SwitchCase` here means the
			// caller is being told about the form they did not use, and the
			// missing member goes unmentioned.
			expect(reported).toContain('ExhaustiveCases');
			expect(reported).not.toContain('SwitchCase');
		});

		it('should point at the branch that is missing', () => {
			// 5.x names the member, 7.x names the key it compiles to. Either
			// locates the gap; neither is the vague assignability complaint that
			// appears when the overloads are ordered the other way.
			expect(reported).toMatch(/Status\.Archived|Property '2'/);
			expect(reported).toContain('is missing');
		});

		it('should accept every call that handles all the members', () => {
			// The fixture holds three complete calls above the incomplete one — a
			// value, a statement, and the predicate form. Exactly one thing in it
			// is wrong, so exactly one thing may be reported.
			expect(reported.split('error TS')).toHaveLength(2);
		});
	},
);
