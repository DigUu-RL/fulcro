import { describe, expect, expectTypeOf, it } from 'vitest';

import type { TypeLayout, WithLayout } from '@/functions/utils/layout';
import { layoutOf } from '@/functions/utils/layoutOf';

/**
 * Behaviour suite for `layoutOf`.
 *
 * It runs with the transformer applied, as the harness applies it to every
 * package, so each call below reaches the test already replaced by an object
 * literal — or, where no single layout exists, left in place to throw.
 *
 * The types are declared through the protocol rather than imported from
 * `@fulcro/types`; that the answer equals a struct descriptor's own `layout`
 * is `tests/transformers`' to prove, where the two packages meet.
 */

type Half = number & {
	readonly '~layout': { readonly size: 2; readonly alignment: 2 };
};

interface Wide {
	readonly '~layout': { readonly size: 16; readonly alignment: 16 };
}

interface AlsoWide {
	readonly '~layout': { readonly size: 16; readonly alignment: 16 };
	readonly tag: 'also';
}

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

/**
 * Tells whether an object and every object inside it is frozen.
 *
 * @param value Value to inspect.
 * @returns `true` when nothing in it can be changed.
 */
const deeplyFrozen = (value: unknown): boolean =>
	typeof value !== 'object' ||
	value === null ||
	(Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));

describe('layoutOf', () => {
	it('should read the layout of a struct, its fields placed', () => {
		expect(layoutOf<Mixed>()).toEqual({
			size: 16,
			alignment: 8,
			fields: {
				flag: { offset: 10, size: 1, alignment: 1 },
				weight: { offset: 0, size: 8, alignment: 8 },
				count: { offset: 8, size: 2, alignment: 2 },
			},
		});
	});

	it('should list the fields in the order they were declared', () => {
		expect(Object.keys(layoutOf<Mixed>().fields)).toEqual([
			'flag',
			'weight',
			'count',
		]);
	});

	it('should report a type without fields with its size, its alignment and none', () => {
		expect(layoutOf<Half>()).toEqual({ size: 2, alignment: 2, fields: {} });
		expect(layoutOf<Wide>()).toEqual({ size: 16, alignment: 16, fields: {} });
	});

	it('should read a union whose members all declare one layout and no fields', () => {
		expect(layoutOf<Wide | AlsoWide>()).toEqual({
			size: 16,
			alignment: 16,
			fields: {},
		});
	});

	it('should hand back a layout nothing can change', () => {
		expect(deeplyFrozen(layoutOf<Mixed>())).toBe(true);
		expect(deeplyFrozen(layoutOf<Half>())).toBe(true);
	});

	it('should infer the sizes and alignments as the literals declared', () => {
		expectTypeOf(layoutOf<Mixed>()).toEqualTypeOf<{
			readonly size: 16;
			readonly alignment: 8;
			readonly fields: {
				readonly flag: {
					readonly offset: number;
					readonly size: 1;
					readonly alignment: 1;
				};
				readonly weight: {
					readonly offset: number;
					readonly size: 8;
					readonly alignment: 8;
				};
				readonly count: {
					readonly offset: number;
					readonly size: 2;
					readonly alignment: 2;
				};
			};
		}>();
		expectTypeOf<TypeLayout<Half>['fields']>().toEqualTypeOf<
			Record<never, never>
		>();
	});

	it('should leave a union of different layouts to throw, having no single answer', () => {
		expect(() => layoutOf<Half | Wide>()).toThrow('layoutOf<T>()');
	});

	it('should leave a generic parameter to throw, having nothing substituted yet', () => {
		const measure = <T extends WithLayout>(): unknown => layoutOf<T>();

		expect(() => measure<Half>()).toThrow(
			expect.objectContaining({ code: 'FULCRO4009' }),
		);
	});
});
