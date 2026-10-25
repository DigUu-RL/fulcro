import { describe, expect, it } from 'vitest';

import { alignOf } from '@/src/functions/utils/alignOf';
import type { WithLayout } from '@/src/functions/utils/layout';

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
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- forwarded to the call the transformer resolves from it
		const measure = <T extends WithLayout>(): number => alignOf<T>();

		expect(() => measure<Declared>()).toThrow('only exists at compile time');
	});
});
