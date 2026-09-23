import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import {
	compile,
	type FixtureName,
	fixturePath,
	FIXTURES,
	runModule,
} from './support/compile';

/**
 * Behaviour suite for the bundler plugin.
 *
 * A bundler never type checks, so what this has to prove is the rewrite
 * itself: that a file handed over by the bundler comes back rewritten exactly
 * as the `tsc` plugin rewrites it — the same program, read through a language
 * service instead of `createProgram` — and that the code a bundler would then
 * strip and run computes the same values.
 *
 * The plugin is loaded from the published entry point, as a bundler loads it.
 */

/** The transform hook of the plugin, as a bundler calls it. */
type Transform = (code: string, id: string) => { code: string } | null;

let transform: Transform;

beforeAll(async () => {
	const { unpluginFactory } = await import('@fulcro/types/unplugin');

	const plugin = unpluginFactory(
		{ tsconfig: path.join(FIXTURES, 'tsconfig.json'), root: FIXTURES },
		{ framework: 'vite' },
	) as { transform: Transform };

	transform = plugin.transform.bind(plugin);
});

/**
 * Hands one fixture to the plugin, as the bundler would.
 *
 * @param name The fixture.
 * @returns The code the bundler gets back, or `null` when left alone.
 */
const bundle = (name: FixtureName): string | null => {
	const fileName: string = fixturePath(name);

	return transform(readFileSync(fileName, 'utf8'), fileName)?.code ?? null;
};

describe('the bundler plugin', { timeout: 60_000 }, () => {
	it.each(['integers', 'floats', 'decimal'] as const)(
		'should rewrite %s exactly as the tsc plugin does',
		(name) => {
			expect(bundle(name)).toBe(compile(name).rewritten);
		},
	);

	it.each(['integers', 'floats', 'decimal'] as const)(
		'should hand back code that computes the same values for %s',
		(name) => {
			const code = bundle(name) as string;

			// What a bundler does next: erase the types, keep the code.
			const javascript: string = ts.transpileModule(code, {
				compilerOptions: {
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2022,
				},
			}).outputText;

			const exported = runModule(fixturePath(name), javascript);
			const expected = compile(name).run();

			for (const key of Object.keys(expected)) {
				if (typeof expected[key] === 'function') continue;

				expect(exported[key]).toEqual(expected[key]);
			}
		},
	);

	it('should leave a file with none of these types to the bundler', () => {
		expect(bundle('untouched')).toBeNull();
	});

	it('should decline a file that is not TypeScript', () => {
		expect(
			transform('export const a = 1 + 2;', path.join(FIXTURES, 'plain.js')),
		).toBeNull();
	});
});
