import * as path from 'node:path';
import * as ts from 'typescript';
import { describe, it, expect, beforeAll } from 'vitest';
import transformer from '@/transformer';

/**
 * Transformer suite.
 *
 * The transformer runs inside the compiler, so it is exercised the only way
 * that proves anything: a fixture is compiled with it and the emitted
 * JavaScript is asserted on. Nothing here imports the fixture at runtime.
 *
 * The fixture imports `@fulcro/reflect` by name, so the program below resolves
 * it through `node_modules` into the built declarations of that package. The
 * suite therefore exercises the transformer across the package boundary, which
 * is the only place the split could have broken it.
 */

/** Root of the package, which the reported declaration paths are relative to. */
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/** Fixture fed to the compiler. */
const FIXTURE_PATH = path.resolve(__dirname, 'fixture.sample.ts');

/** JavaScript emitted for the fixture, shared by every assertion. */
let emitted = '';

/**
 * Compiles the fixture with the transformer applied.
 *
 * @returns The emitted JavaScript.
 */
const compileFixture = (): string => {
	const program: ts.Program = ts.createProgram([FIXTURE_PATH], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		// Required: an ESNext module defaults to the classic resolution, which
		// never looks for an `index.ts` inside a directory, and every import of
		// the fixture would silently resolve to nothing — leaving the
		// transformer with symbols it cannot trace back to our modules.
		moduleResolution: ts.ModuleResolutionKind.Node10,
		strict: true,
		noEmitOnError: false,
		skipLibCheck: true,
	});

	let output = '';

	const result: ts.EmitResult = program.emit(
		program.getSourceFile(FIXTURE_PATH),
		(fileName, text) => {
			if (fileName.endsWith('.js')) output = text;
		},
		undefined,
		false,
		{
			before: [transformer(program, { projectRoot: PROJECT_ROOT })],
		},
	);

	const errors: readonly ts.Diagnostic[] = result.diagnostics.filter(
		(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
	);

	if (errors.length > 0) {
		throw new Error(
			ts.formatDiagnostics(errors, {
				getCanonicalFileName: (name) => name,
				getCurrentDirectory: () => PROJECT_ROOT,
				getNewLine: () => '\n',
			}),
		);
	}

	return output;
};

beforeAll(() => {
	emitted = compileFixture();
});

describe('nameOf at compile time', () => {
	it('should replace an accessor with the name it reads', () => {
		expect(emitted).toContain('export const accessorName = "email"');
	});

	it('should report the last segment of a deep accessor', () => {
		expect(emitted).toContain('export const deepAccessorName = "theme"');
	});

	it('should resolve an indexed access', () => {
		expect(emitted).toContain('export const indexedName = "email"');
	});

	it('should name an interface, which runtime cannot see at all', () => {
		expect(emitted).toContain('export const interfaceName = "UserContract"');
	});

	it('should name a type alias', () => {
		expect(emitted).toContain('export const aliasName = "Theme"');
	});

	it('should leave no call to the runtime implementation behind', () => {
		// Every nameOf of the fixture is statically resolvable, so none of them
		// may survive as a call.
		expect(emitted).not.toContain('nameOf(');
	});
});

describe('typeOf at compile time', () => {
	it('should inject the declared type of the inspected expression', () => {
		expect(emitted).toContain('text: "UserContract"');
		expect(emitted).toContain('kind: "interface"');
	});

	it('should inject the declaration site as a project relative path', () => {
		expect(emitted).toMatch(
			/path: "src\/tests\/transformer\/fixture\.sample\.ts"/,
		);
		expect(emitted).toMatch(/line: \d+/);
		expect(emitted).toMatch(/column: \d+/);
	});

	it('should describe a primitive expression without a declaration site', () => {
		// `user.email` is a `string`, which is declared nowhere.
		expect(emitted).toContain('text: "string"');
		expect(emitted).toContain('kind: "primitive"');
		expect(emitted).toContain('site: null');
	});

	it('should keep the inspected value as the first argument', () => {
		expect(emitted).toMatch(/typeOf\(user,\s*\{/);
		expect(emitted).toMatch(/typeOf\(user\.email,\s*\{/);
	});
});

describe('defaultOf at compile time', () => {
	/**
	 * Reads back the value the transformer emitted for an exported binding.
	 *
	 * @param binding Name of the exported constant.
	 * @returns The emitted expression, with its whitespace collapsed.
	 */
	const emittedValueOf = (binding: string): string => {
		const match: RegExpMatchArray | null = emitted.match(
			new RegExp(`export const ${binding} = ([\\s\\S]*?);\\n`),
		);

		if (match === null) throw new Error(`${binding} was not emitted`);

		return match[1].replace(/\s+/g, ' ');
	};

	it('should resolve the primitives to their empty value', () => {
		expect(emittedValueOf('defaultString')).toBe('""');
		expect(emittedValueOf('defaultNumber')).toBe('0');
		expect(emittedValueOf('defaultBoolean')).toBe('false');
	});

	it('should resolve a literal union to its first inhabitant', () => {
		expect(emittedValueOf('defaultTheme')).toBe('"dark"');
	});

	it('should build a nested shape, filling what the type requires', () => {
		const value: string = emittedValueOf('defaultOrder');

		expect(value).toContain('id: 0');
		expect(value).toContain('paid: false');
		expect(value).toContain('label: ""');
		expect(value).toContain('customer: { name: "", active: false }');
	});

	it('should leave optional properties out, since absence satisfies them', () => {
		expect(emittedValueOf('defaultOrder')).not.toContain('note');
	});

	it('should fill a tuple position by position and empty an array', () => {
		const value: string = emittedValueOf('defaultOrder');

		expect(value).toContain('items: []');
		expect(value).toContain('pair: [0, ""]');
	});

	it('should instantiate the built-in collections rather than describe them', () => {
		const value: string = emittedValueOf('defaultOrder');

		expect(value).toContain('tags: new Set()');
		expect(value).toContain('placedAt: new Date(0)');
	});

	it('should prefer the empty inhabitant of a nullable union', () => {
		expect(emittedValueOf('defaultOrder')).toContain('nickname: null');
		expect(emittedValueOf('defaultOptional')).toBe('undefined');
	});

	it('should resolve an enum to its first member', () => {
		expect(emittedValueOf('defaultStatus')).toBe('0');
	});

	it('should close a circular type instead of nesting forever', () => {
		const value: string = emittedValueOf('defaultTree');

		expect(value).toContain('label: ""');
		expect(value).toContain('parent: null');
	});

	it('should honour a function type with its own return default', () => {
		expect(emittedValueOf('defaultCallback')).toBe('() => ""');
	});

	it('should infer the type from the context when none is written', () => {
		expect(emittedValueOf('contextual')).toBe('{ name: "", active: false }');
	});

	it('should leave no call to the runtime implementation behind', () => {
		// Every defaultOf of the fixture is statically resolvable, and the
		// runtime one only ever throws.
		expect(emitted).not.toContain('defaultOf(');
	});
});
