import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import {
	COMPILER_OPTIONS,
	FIXTURE_NAMES,
	type FixtureName,
	fixturePath,
	markedLines,
} from './support/compile';

/**
 * Behaviour suite for the editor plugin.
 *
 * A real language service is built over the fixtures, as `tsserver` builds one
 * over a project, and the plugin is created on it the way `tsserver` creates a
 * plugin: loaded with `require` from the published entry point, handed the
 * service and its host. Each question an editor asks is then put to both — the
 * service alone, and the plugin — and the difference is the assertion: what an
 * editor without the plugin shows, and what it shows with it.
 */

/** The plugin module, as `tsserver` receives it. */
type PluginModule = (modules: { typescript: typeof ts }) => {
	create: (info: {
		languageService: ts.LanguageService;
		languageServiceHost: ts.LanguageServiceHost;
	}) => ts.LanguageService;
};

let plain: ts.LanguageService;
let plugged: ts.LanguageService;

/** Text of each fixture, as the editor holds it. */
const texts = new Map<string, string>(
	FIXTURE_NAMES.map((name) => [
		fixturePath(name),
		readFileSync(fixturePath(name), 'utf8'),
	]),
);

beforeAll(() => {
	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => [...texts.keys()],
		getScriptVersion: () => '1',
		getScriptSnapshot: (fileName) => {
			const text: string | undefined =
				texts.get(fileName) ?? ts.sys.readFile(fileName);

			return text === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(text);
		},
		getCurrentDirectory: () => process.cwd(),
		getCompilationSettings: () => COMPILER_OPTIONS,
		getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
		getProjectVersion: () => '1',
		fileExists: (fileName) =>
			texts.has(fileName) || ts.sys.fileExists(fileName),
		readFile: (fileName) => texts.get(fileName) ?? ts.sys.readFile(fileName),
		readDirectory: ts.sys.readDirectory,
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
	};

	plain = ts.createLanguageService(host, ts.createDocumentRegistry());

	const plugin = createRequire(__filename)(
		'@fulcro/types/language-service',
	) as PluginModule;

	plugged = plugin({ typescript: ts }).create({
		languageService: plain,
		languageServiceHost: host,
	});
});

/**
 * The offset of a piece of text in a fixture.
 *
 * @param name The fixture.
 * @param needle Text to find.
 * @param shift Offset within the needle.
 * @returns The offset.
 */
const offsetOf = (name: FixtureName, needle: string, shift = 0): number => {
	const index: number = (texts.get(fixturePath(name)) as string).indexOf(
		needle,
	);

	if (index === -1) throw new Error(`${needle} is not in ${name}`);

	return index + shift;
};

/**
 * The line of each error an editor would underline in a fixture.
 *
 * @param service Service asked.
 * @param name The fixture.
 * @returns One-based lines.
 */
const errorLines = (
	service: ts.LanguageService,
	name: FixtureName,
): number[] => {
	const fileName: string = fixturePath(name);
	const text: string = texts.get(fileName) as string;

	return service
		.getSemanticDiagnostics(fileName)
		.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
		.map((diagnostic) => text.slice(0, diagnostic.start).split('\n').length);
};

/**
 * The type an editor shows on hover.
 *
 * @param service Service asked.
 * @param name The fixture.
 * @param position Offset hovered.
 * @returns The text of the hover.
 */
const hover = (
	service: ts.LanguageService,
	name: FixtureName,
	position: number,
): string =>
	ts.displayPartsToString(
		service.getQuickInfoAtPosition(fixturePath(name), position)?.displayParts,
	);

describe('the editor plugin', { timeout: 60_000 }, () => {
	it('should clear the errors plain TypeScript shows on decimal operators', () => {
		expect(errorLines(plain, 'decimal').length).toBeGreaterThan(0);
		expect(errorLines(plugged, 'decimal')).toEqual([]);
	});

	it('should clear them on every fixture that builds', () => {
		for (const name of ['integers', 'floats', 'untouched'] as const) {
			expect(errorLines(plugged, name)).toEqual([]);
		}
	});

	it('should underline operands of different types on the lines they were written', () => {
		expect(errorLines(plugged, 'mixed')).toEqual(markedLines('mixed'));
	});

	it('should place each error inside the expression that caused it', () => {
		const fileName: string = fixturePath('mixed');
		const text: string = texts.get(fileName) as string;
		const [first] = plugged.getSemanticDiagnostics(fileName);
		const expression: number = offsetOf('mixed', 'a + 1');

		expect(first.start).toBeGreaterThanOrEqual(expression);
		expect(
			(first.start as number) + (first.length as number),
		).toBeLessThanOrEqual(expression + 'a + 1'.length);
		expect(first.file?.text).toBe(text);
	});

	it('should show the type an operator produces, where plain TypeScript shows number', () => {
		const position: number = offsetOf('integers', 'const sum', 'const '.length);

		expect(hover(plain, 'integers', position)).toBe('const sum: number');
		expect(hover(plugged, 'integers', position)).toBe(
			'const sum: SignedInteger<32>',
		);
	});

	it('should show a decimal where plain TypeScript cannot type the expression', () => {
		const position: number = offsetOf(
			'decimal',
			'const subtotal',
			'const '.length,
		);

		expect(hover(plugged, 'decimal', position)).toBe('const subtotal: Decimal');
	});

	it('should map the span of a hover back onto the text as written', () => {
		const position: number = offsetOf(
			'integers',
			'const square',
			'const '.length,
		);
		const info = plugged.getQuickInfoAtPosition(
			fixturePath('integers'),
			position,
		);

		expect(info?.textSpan).toEqual({
			start: position,
			length: 'square'.length,
		});
	});

	it('should complete the members of the type an operator produced', () => {
		const fileName: string = fixturePath('decimal');
		const position: number = offsetOf(
			'decimal',
			'(subtotal + tax).toString()',
			'(subtotal + tax).'.length,
		);
		const names: string[] =
			plugged
				.getCompletionsAtPosition(fileName, position, {})
				?.entries.map((entry) => entry.name) ?? [];

		expect(names).toContain('multiply');
		expect(names).toContain('toFixed');
	});

	it('should find a definition through rewritten code, at its original place', () => {
		const fileName: string = fixturePath('integers');
		const usage: number = offsetOf('integers', 'sum * sum');
		const declaration: number = offsetOf(
			'integers',
			'const sum',
			'const '.length,
		);
		const found = plugged.getDefinitionAndBoundSpan(fileName, usage);

		expect(found?.textSpan).toEqual({ start: usage, length: 'sum'.length });
		expect(found?.definitions?.[0].textSpan).toEqual({
			start: declaration,
			length: 'sum'.length,
		});
	});

	it('should leave every other question to the original service', () => {
		const fileName: string = fixturePath('integers');

		expect(plugged.getSyntacticDiagnostics(fileName)).toEqual(
			plain.getSyntacticDiagnostics(fileName),
		);
		expect(plugged.getOutliningSpans(fileName)).toEqual(
			plain.getOutliningSpans(fileName),
		);
	});
});
