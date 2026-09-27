import { createRequire } from 'node:module';

import { beforeAll, describe, expect, it } from 'vitest';

import { type CompiledStructs, compileStructs } from './struct.fixture.mjs';

/**
 * `layoutOf` across the package boundary.
 *
 * `struct()` in `@fulcro/types` places the fields at runtime; the transformer
 * of `@fulcro/reflect` places them again at compile time, from the type alone.
 * There are two implementations of one rule, in two packages that do not
 * import each other, and this is the suite that holds them to one answer:
 * every layout the transformer emitted is compared with the `layout` the
 * struct's own descriptor carries, in the same run.
 */

/** Resolves the built packages the way a consumer does. */
const require = createRequire(import.meta.url);

/** The fixture, compiled and run once. */
let compiled: CompiledStructs;

beforeAll(() => {
	compiled = compileStructs();
});

/** A struct descriptor, as far as this suite reads it. */
interface Described {
	readonly layout: { readonly fields: object };
}

describe('layoutOf over the structs of @fulcro/types', () => {
	it.each(['Mixed', 'Reversed', 'Outer', 'Account'])(
		'should emit for %s the layout its descriptor computes',
		(name) => {
			const layouts = compiled.exports.layouts as Record<string, unknown>;
			const descriptor = compiled.exports[name] as Described;

			expect(layouts[name]).toEqual(descriptor.layout);
			expect(
				Object.keys((layouts[name] as Described['layout']).fields),
			).toEqual(Object.keys(descriptor.layout.fields));
			expect(Object.isFrozen(layouts[name])).toBe(true);
		},
	);

	it('should read a struct shipped as a declaration only, in its declared order', () => {
		const {
			DoublePrecisionFloat,
			SinglePrecisionFloat,
			UnsignedInteger,
			struct,
		} = require('@fulcro/types') as typeof import('@fulcro/types');

		// The same fields in the same order as `struct.declared.d.ts`: what that
		// declaration would have been built from.
		const Shipped = struct('Shipped', {
			small: SinglePrecisionFloat,
			big: DoublePrecisionFloat,
			other: SinglePrecisionFloat,
			last: UnsignedInteger(16),
		});

		const layouts = compiled.exports.layouts as Record<string, unknown>;

		expect(layouts.Shipped).toEqual(Shipped.layout);
	});

	it('should report a numeric type with its size, its alignment and no fields', () => {
		const layouts = compiled.exports.layouts as Record<string, unknown>;

		expect(layouts.SinglePrecisionFloat).toEqual({
			size: 4,
			alignment: 4,
			fields: {},
		});
	});

	it('should leave no call behind', () => {
		expect(compiled.emitted).not.toMatch(/layoutOf\(/);
	});
});
