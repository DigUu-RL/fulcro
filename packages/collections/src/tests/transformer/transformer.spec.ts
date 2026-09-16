import * as path from 'node:path';

import * as ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import transformer from '@/transformer';

/**
 * Transformer suite.
 *
 * The transformer runs inside the compiler, so it is exercised the only way
 * that proves anything: a fixture is compiled with it and the emitted
 * JavaScript is asserted on. Nothing here imports the fixture at runtime.
 *
 * The fixture imports `@fulcro/collections` by name, so the program below
 * resolves it through `node_modules` into the built declarations of that
 * package. That matters more here than it does for `@fulcro/reflect`: these are
 * **method** calls, claimed by following the method symbol back to the
 * `Sequence` declaration rather than by following an import. A same-tree
 * relative import would never exercise the path that actually ships.
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
		// `Bundler`, and the choice matters. An ESNext module defaults to the
		// classic resolution, which finds nothing at all. `Node10` finds the main
		// entry but not the `exports` subpaths, so `@fulcro/collections/async`
		// resolved to nothing — and a type the checker cannot see is a call the
		// transformer cannot claim, silently. The fixture compiled, the emitted
		// code kept `.cast()` unresolved, and nothing said why.
		moduleResolution: ts.ModuleResolutionKind.Bundler,
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

describe('ofType at compile time', () => {
	it('should turn a primitive type argument into a typeof name', () => {
		// Quote-agnostic: which quotes the printer chooses is its business, and
		// asserting on them would make this fail over a cosmetic change.
		expect(emitted).toMatch(/\.ofType\(['"]string['"]\)/);
	});

	it('should turn a class type argument into the constructor itself', () => {
		// A reference to the value, not its name as a string: `instanceof` needs
		// the binding, and the binding is what survives into the emitted code.
		expect(emitted).toContain('.ofType(Admin)');
	});

	it('should leave a call that was already given a token alone', () => {
		expect(emitted).toMatch(/\.ofType\(['"]number['"]\)/);
	});
});

describe('cast at compile time', () => {
	it('should resolve a primitive the same way', () => {
		expect(emitted).toMatch(/\.cast\(['"]string['"]\)/);
	});

	it('should resolve a class the same way', () => {
		expect(emitted).toContain('.cast(Admin)');
	});
});

describe('an interface, written out as checks', () => {
	/**
	 * Reads back the line the fixture emitted for one export.
	 *
	 * @param name Name of the exported constant.
	 * @returns That line of the emitted JavaScript.
	 */
	const lineFor = (name: string): string => {
		const line: string | undefined = emitted
			.split('\n')
			.find((candidate) => candidate.includes(`export const ${name} `));

		if (line === undefined) {
			throw new Error(`The fixture emitted nothing for ${name}.`);
		}

		return line;
	};

	it('should check each declared property', () => {
		const line: string = lineFor('accounts');

		expect(line).toContain('typeof v === "object"');
		expect(line).toContain('typeof v.id === "number"');
	});

	it('should reject null before reading a property off it', () => {
		// `typeof null` is `'object'`, so without this the check would go on to
		// read a property of null and throw instead of answering.
		expect(lineFor('accounts')).toContain('v !== null');
	});

	it('should allow an optional property to be absent', () => {
		expect(lineFor('orders')).toContain(
			'(v.note === undefined || typeof v.note === "string")',
		);
	});

	it('should check every element of an array, not just that it is one', () => {
		expect(lineFor('orders')).toContain(
			'Array.isArray(v.tags) && v.tags.every(e0 => typeof e0 === "string")',
		);
	});

	it('should descend into a nested object', () => {
		expect(lineFor('orders')).toContain('typeof v.customer.email === "string"');
	});

	it('should compare a union of literals against each one', () => {
		expect(lineFor('orders')).toContain(
			'(v.status === "pending" || v.status === "paid")',
		);
	});

	it('should use instanceof for a built-in class', () => {
		// `Date` is declared as an interface beside a separate constructor, so
		// the class flag alone misses it — and the shape path then writes out a
		// check for all fifty of its methods, including a symbol-keyed one whose
		// compiler spelling cannot appear in source at all.
		expect(lineFor('orders')).toContain('v.placedAt instanceof Date');
		expect(lineFor('orders')).not.toContain('__@');
	});

	it('should pin the length of a tuple', () => {
		expect(lineFor('pairs')).toContain('v.length === 2');
		expect(lineFor('pairs')).toContain('typeof v[0] === "string"');
		expect(lineFor('pairs')).toContain('typeof v[1] === "number"');
	});

	it('should carry the type as written, for the error cast throws', () => {
		expect(lineFor('accounts')).toContain('name: "Account"');
	});
});

describe('a type that contains itself', () => {
	/**
	 * Reads back the emitted code for one export, which for a recursive type
	 * spans several lines.
	 *
	 * @param name Name of the exported constant.
	 * @returns Everything from that export up to the next one.
	 */
	const blockFor = (name: string): string => {
		const start: number = emitted.indexOf(`export const ${name} `);

		if (start === -1) {
			throw new Error(`The fixture emitted nothing for ${name}.`);
		}

		const next: number = emitted.indexOf('export const ', start + 1);

		return next === -1 ? emitted.slice(start) : emitted.slice(start, next);
	};

	it('should become a function that calls itself', () => {
		const block: string = blockFor('trees');

		// A name to call is the whole reason this form exists: the reference that
		// closes the cycle is met while the body is still being written.
		expect(block).toMatch(/const (check\d+) = \w+ =>/);
		expect(block).toMatch(/\.every\(\w+ => check\d+\(\w+\)\)/);
	});

	it('should declare it once, where the call sits', () => {
		// Inside an expression that runs where the call is, not once per element
		// and not as a name added to the surrounding scope.
		expect(blockFor('trees')).toContain('(() => {');
		expect(blockFor('trees')).toContain('return { name: "Tree"');
	});

	it('should follow a cycle that runs through a second type', () => {
		const block: string = blockFor('authors');

		// `Author` refers to `Post` which refers back to `Author`. Neither is
		// recursive on its own, and a search that only looked one level down
		// would write both out inline and never terminate.
		expect(block).toMatch(/const check\d+ =/);
		expect(block).toContain('name: "Author"');
		expect(block).toContain('typeof');
	});
});

describe('what it still refuses', () => {
	it('should refuse an index signature', () => {
		// Arbitrary keys mean there is no fixed set of properties to check, and
		// a check over no properties would accept any object at all.
		expect(emitted).toMatch(/export const settings [^\n]*\.ofType\(\)/);
	});

	it('should resolve everything else it was given', () => {
		// Exactly one unresolved call in the whole fixture. A second would mean a
		// form was quietly skipped, which is the failure that looks like nothing
		// at compile time.
		const unresolved: number = (emitted.match(/\.(ofType|cast)\(\)/g) ?? [])
			.length;

		expect(unresolved).toBe(1);
	});
});

describe('the asynchronous sequence', () => {
	it('should resolve a primitive there too', () => {
		// Declared in a sibling module to the synchronous one. A rewriter that
		// named only the `sequence` folder would leave every asynchronous call
		// unresolved, and say nothing about it.
		expect(emitted).toMatch(/streamedStrings[^\n]*\.ofType\(['"]string['"]\)/);
	});

	it('should write an interface out there too', () => {
		const line: string | undefined = emitted
			.split('\n')
			.find((candidate) => candidate.includes('streamedOrders'));

		expect(line).toContain('name: "Order"');
		expect(line).toContain('typeof v.id === "number"');
		expect(line).toContain('v.placedAt instanceof Date');
	});
});

describe('chained calls', () => {
	it('should rewrite both halves of a chain', () => {
		// The rewriter visits the expression it is called on, so a rewritten call
		// sitting inside another is not skipped.
		expect(emitted).toMatch(
			/\.ofType\(['"]string['"]\)\.cast\(['"]string['"]\)/,
		);
	});
});
