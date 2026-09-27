import { describe, expect, it } from 'vitest';

import { offsetOf } from '@/functions/utils/offsetOf';

/**
 * Behaviour suite for `offsetOf`.
 *
 * It runs with the transformer applied, as the harness applies it to every
 * package, so each call below reaches the test already replaced by a number —
 * or, where no single number exists, left in place to throw.
 *
 * The structs are declared here through the protocol rather than imported
 * from `@fulcro/types`: a layout listing each field's size and alignment, and
 * no offset. Every offset asserted below was therefore placed by the
 * transformer. That it agrees with what `struct()` places at runtime is
 * `tests/transformers`' to prove, where the two packages meet.
 */

/** Declared smallest first, so that placement by alignment has to reorder it. */
interface Mixed {
	readonly '~layout': {
		readonly size: 16;
		readonly alignment: 8;
		readonly fields: {
			readonly flag: { readonly size: 1; readonly alignment: 1 };
			readonly weight: { readonly size: 8; readonly alignment: 8 };
			readonly count: { readonly size: 2; readonly alignment: 2 };
		};
	};
}

/** Three fields of one alignment, written back to front. */
interface Reversed {
	readonly '~layout': {
		readonly size: 12;
		readonly alignment: 4;
		readonly fields: {
			readonly z: { readonly size: 4; readonly alignment: 4 };
			readonly y: { readonly size: 4; readonly alignment: 4 };
			readonly x: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

/** The same three, in the usual order: same size, different offsets. */
interface Vector {
	readonly '~layout': {
		readonly size: 12;
		readonly alignment: 4;
		readonly fields: {
			readonly x: { readonly size: 4; readonly alignment: 4 };
			readonly y: { readonly size: 4; readonly alignment: 4 };
			readonly z: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

/** A struct inside a struct: a field is placed by its own layout. */
interface Nested {
	readonly '~layout': {
		readonly size: 24;
		readonly alignment: 8;
		readonly fields: {
			readonly tag: { readonly size: 1; readonly alignment: 1 };
			readonly inner: { readonly size: 16; readonly alignment: 8 };
			readonly ratio: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

describe('offsetOf', () => {
	it('should place fields by alignment, largest first', () => {
		expect(offsetOf<Mixed>('weight')).toBe(0);
		expect(offsetOf<Mixed>('count')).toBe(8);
		expect(offsetOf<Mixed>('flag')).toBe(10);
	});

	it('should keep declaration order among fields of one alignment', () => {
		expect(offsetOf<Vector>('x')).toBe(0);
		expect(offsetOf<Vector>('z')).toBe(8);
		expect(offsetOf<Reversed>('z')).toBe(0);
		expect(offsetOf<Reversed>('x')).toBe(8);
	});

	it('should place a nested struct by its own size and alignment', () => {
		expect(offsetOf<Nested>('inner')).toBe(0);
		expect(offsetOf<Nested>('ratio')).toBe(16);
		expect(offsetOf<Nested>('tag')).toBe(20);
	});

	it('should read it through an alias and an intersection', () => {
		type Alias = Mixed;

		expect(offsetOf<Alias>('count')).toBe(8);
		expect(offsetOf<Mixed & { readonly weight: number }>('flag')).toBe(10);
	});

	it('should leave a field held in a variable to throw, naming it', () => {
		const field: 'flag' | 'count' = ['flag', 'count'][0] as 'flag';

		expect(() => offsetOf<Mixed>(field)).toThrow(
			expect.objectContaining({
				code: 'FULCRO4009',
				message: expect.stringContaining('offsetOf<T>("flag")'),
			}),
		);
	});

	it('should leave a union of structs placing the field differently to throw', () => {
		expect(() => offsetOf<Vector | Reversed>('x')).toThrow(
			'a union of layouts has no single one',
		);
	});

	it('should leave a generic parameter to throw, having nothing substituted yet', () => {
		const locate = <T extends Mixed>(): number => offsetOf<T>('flag');

		expect(() => locate<Mixed>()).toThrow(
			'a generic parameter has no layout until it is substituted',
		);
	});
});
