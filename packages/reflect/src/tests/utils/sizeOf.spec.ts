import { describe, expect, it } from 'vitest';

import type { WithLayout } from '@/functions/utils/layout';
import { sizeOf } from '@/functions/utils/sizeOf';

/**
 * Behaviour suite for `sizeOf`.
 *
 * It runs with the transformer applied, as the harness applies it to every
 * package, so each call below reaches the test already replaced by a number —
 * or, where no single number exists, left in place to throw.
 *
 * The types are declared here rather than imported from `@fulcro/types`: the
 * protocol is a shape, and this suite proves the shape is all it takes. The
 * two packages meeting across the boundary is `tests/transformers`' to prove.
 */

type Half = number & {
	readonly '~layout': { readonly size: 2; readonly alignment: 2 };
};

interface Wide {
	readonly '~layout': { readonly size: 16; readonly alignment: 16 };
}

class Declared {
	declare readonly '~layout': { readonly size: 12; readonly alignment: 4 };
}

describe('sizeOf', () => {
	it('should read the size a type declares', () => {
		expect(sizeOf<Half>()).toBe(2);
		expect(sizeOf<Wide>()).toBe(16);
		expect(sizeOf<Declared>()).toBe(12);
	});

	it('should read it through an alias and an intersection', () => {
		type Alias = Half;

		expect(sizeOf<Alias>()).toBe(2);
		expect(sizeOf<Wide & { readonly extra: true }>()).toBe(16);
	});

	it('should read the size of a union whose members all declare it', () => {
		interface AlsoWide {
			readonly '~layout': { readonly size: 16; readonly alignment: 16 };
			readonly tag: 'also';
		}

		expect(sizeOf<Wide | AlsoWide>()).toBe(16);
	});

	it('should leave a union of different layouts to throw, having no single answer', () => {
		expect(() => sizeOf<Half | Wide>()).toThrow('sizeOf<T>()');
	});

	it('should leave a generic parameter to throw, having nothing substituted yet', () => {
		const measure = <T extends WithLayout>(): number => sizeOf<T>();

		expect(() => measure<Half>()).toThrow(
			'a generic parameter has no layout until it is substituted',
		);
	});
});
