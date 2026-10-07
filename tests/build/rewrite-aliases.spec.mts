import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	outDirOf,
	rewriteAliases,
	rewriteText,
} from '../../tools/build/rewrite-aliases.mjs';

/**
 * Behaviour suite for the alias rewrite every package's build ends with.
 *
 * Each case builds a small package in a temporary directory — a tsconfig and
 * the output `tsc` would have left — and asks the script what it makes of it.
 * The proof that it matches what `tsc-alias` produced across the real packages
 * was a byte-for-byte comparison of every `dist` when it replaced it; these
 * cases keep each rule it relies on from drifting.
 */

let root = '';

/**
 * Writes a file under the temporary package, creating its directories.
 *
 * @param relative Path inside the package.
 * @param text Contents.
 * @returns The absolute path.
 */
const write = (relative: string, text: string): string => {
	const file = path.join(root, relative);

	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, text);

	return file;
};

/** A tsconfig of the one shape the script supports. */
const TSCONFIG = JSON.stringify({
	compilerOptions: {
		rootDir: './src',
		outDir: './dist',
		paths: { '@/*': ['./src/*'] },
	},
});

beforeEach(() => {
	root = mkdtempSync(path.join(os.tmpdir(), 'rewrite-aliases-'));
	write('tsconfig.json', TSCONFIG);
	write('dist/storage/index.js', '');
	write('dist/storage/requireIndex.js', '');
	write('dist/pool/index.js', '');
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('rewrite-aliases', () => {
	it('should point a directory at its index, and a module at its file', () => {
		const file = path.join(root, 'dist/index.js');

		expect(
			rewriteText(
				path.join(root, 'dist'),
				file,
				'const a = require("@/storage");\nconst b = require("@/storage/requireIndex");',
			),
		).toBe(
			'const a = require("./storage/index.js");\nconst b = require("./storage/requireIndex.js");',
		);
	});

	it('should climb out of a nested file, and keep the quotes it found', () => {
		const file = path.join(root, 'dist/pool/index.d.ts');

		expect(
			rewriteText(
				path.join(root, 'dist'),
				file,
				"import type { Storage } from '@/storage';",
			),
		).toBe("import type { Storage } from '../storage/index.js';");
	});

	it('should keep an extension the source already wrote', () => {
		const file = path.join(root, 'dist/index.js');

		expect(
			rewriteText(
				path.join(root, 'dist'),
				file,
				"export { createPool } from '@/pool/index.js';",
			),
		).toBe("export { createPool } from './pool/index.js';");
	});

	it('should rewrite a type imported inline, and a bare import', () => {
		const file = path.join(root, 'dist/index.d.ts');

		expect(
			rewriteText(
				path.join(root, 'dist'),
				file,
				"type T = import('@/storage').Storage<number>;\nimport '@/pool';",
			),
		).toBe(
			"type T = import('./storage/index.js').Storage<number>;\nimport './pool/index.js';",
		);
	});

	it('should leave a path mentioned in a comment as it was written', () => {
		const text = ' * see `@/storage` for the contract';

		expect(
			rewriteText(path.join(root, 'dist'), path.join(root, 'dist/x.js'), text),
		).toBe(text);
	});

	it('should refuse a specifier that resolves to nothing it emitted', () => {
		expect(() =>
			rewriteText(
				path.join(root, 'dist'),
				path.join(root, 'dist/index.js'),
				'require("@/missing")',
			),
		).toThrow(/'@\/missing' .* resolves to nothing/);
	});

	it('should rewrite a whole package in place, and count the files it changed', () => {
		write('dist/index.js', 'require("@/storage");');
		write('dist/index.d.ts', "export type { Storage } from '@/storage';");
		write('dist/plain.js', 'module.exports = 1;');

		expect(rewriteAliases(root)).toBe(2);
		expect(readFileSync(path.join(root, 'dist/index.js'), 'utf8')).toBe(
			'require("./storage/index.js");',
		);
		expect(readFileSync(path.join(root, 'dist/plain.js'), 'utf8')).toBe(
			'module.exports = 1;',
		);
	});

	it('should read a tsconfig written with comments', () => {
		write(
			'tsconfig.json',
			'{\n\t"compilerOptions": {\n\t\t// why\n\t\t"rootDir": "./src",\n\t\t"outDir": "./dist",\n\t\t"paths": { "@/*": ["./src/*"] },\n\t},\n}',
		);

		expect(outDirOf(root)).toBe(path.join(root, 'dist'));
	});

	it.each([
		['no alias', { rootDir: './src', outDir: './dist' }],
		[
			'another alias',
			{ rootDir: './src', outDir: './dist', paths: { '~/*': ['./src/*'] } },
		],
		[
			'an alias outside rootDir',
			{ rootDir: './src', outDir: './dist', paths: { '@/*': ['./lib/*'] } },
		],
	])('should refuse a tsconfig with %s', (_label, compilerOptions) => {
		write('tsconfig.json', JSON.stringify({ compilerOptions }));

		expect(() => outDirOf(root)).toThrow(/exactly one alias/);
	});
});
