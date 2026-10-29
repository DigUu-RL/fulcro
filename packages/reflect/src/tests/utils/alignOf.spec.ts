import { describe, expect, expectTypeOf, it } from 'vitest';

import { alignOf } from '@/src/functions/utils/alignOf';
import type { TypeLayout, WithLayout } from '@/src/functions/utils/layout';

/**
 * Behaviour suite for `alignOf`.
 *
 * It runs with the transformer applied, so each call reaches the test already
 * replaced by a number, or left in place to throw.
 */

type Half = number & {
	readonly '~layout': { readonly size: 2; readonly alignment: 2 };
};

class Declared {
	declare readonly '~layout': { readonly size: 12; readonly alignment: 4 };
}

describe('alignOf', () => {
	it('should read the alignment a type declares, not its size', () => {
		expect(alignOf<Half>()).toBe(2);
		expect(alignOf<Declared>()).toBe(4);
	});

	it('should leave a union of different alignments to throw', () => {
		expect(() => alignOf<Half | Declared>()).toThrow('alignOf<T>()');
	});

	it('should leave a generic parameter to throw', () => {
		const measure = <T extends WithLayout>(): TypeLayout<T>['alignment'] => alignOf<T>();

		expect(() => measure<Declared>()).toThrow('only exists at compile time');
	});
});

describe('what alignOf declares', () => {
	it('should return the alignment the layout declares, as its literal', () => {
		expectTypeOf<ReturnType<typeof alignOf<Declared>>>().toEqualTypeOf<4>();
		expectTypeOf<ReturnType<typeof alignOf<Declared>>>().toExtend<number>();
	});
});
