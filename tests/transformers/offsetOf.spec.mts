import { createRequire } from 'node:module';

import { beforeAll, describe, expect, it } from 'vitest';

import { type CompiledStructs, compileStructs } from './struct.fixture.mjs';

/**
 * `offsetOf` across the package boundary.
 *
 * Every offset the transformer emitted, from a struct's type alone, is
 * compared with the offset `struct()` placed the same field at at runtime —
 * for structs declared in the program and for one that arrives as a
 * declaration file, which is how a struct from a built package arrives.
 */

/** Resolves the built packages the way a consumer does. */
const require = createRequire(import.meta.url);

/** The fixture, compiled and run once. */
let compiled: CompiledStructs;

beforeAll(() => {
	compiled = compileStructs();
});

/**
 * The offset of each field, as a struct's descriptor placed it.
 *
 * @param descriptor The descriptor.
 * @returns Offsets by field name.
 */
const offsetsOf = (descriptor: {
	readonly layout: {
		readonly fields: Readonly<Record<string, { readonly offset: number }>>;
	};
}): Record<string, number> =>
	Object.fromEntries(
		Object.entries(descriptor.layout.fields).map(([name, field]) => [
			name,
			field.offset,
		]),
	);

describe('offsetOf over the structs of @fulcro/types', () => {
	it.each(['Mixed', 'Reversed', 'Outer', 'Account'])(
		'should emit for %s the offsets its descriptor places',
		(name) => {
			const offsets = compiled.exports.offsets as Record<string, unknown>;

			expect(offsets[name]).toEqual(
				offsetsOf(compiled.exports[name] as Parameters<typeof offsetsOf>[0]),
			);
		},
	);

	it('should place a struct shipped as a declaration only by its declared order', () => {
		const {
			DoublePrecisionFloat,
			SinglePrecisionFloat,
			UnsignedInteger,
			struct,
		} = require('@fulcro/types') as typeof import('@fulcro/types');

		const Shipped = struct('Shipped', {
			small: SinglePrecisionFloat,
			big: DoublePrecisionFloat,
			other: SinglePrecisionFloat,
			last: UnsignedInteger(16),
		});

		const offsets = compiled.exports.offsets as Record<string, unknown>;

		// big 0; small 8 and other 12, in the order they were declared; last 16.
		expect(offsets.Shipped).toEqual({ big: 0, small: 8, other: 12, last: 16 });
		expect(offsets.Shipped).toEqual(offsetsOf(Shipped));
	});

	it('should leave no call behind', () => {
		expect(compiled.emitted).not.toMatch(/offsetOf\(/);
	});
});
