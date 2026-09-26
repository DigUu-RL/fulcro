import { describe, expect, it } from 'vitest';

import { catalog } from '@/catalog';
import { collectionsCatalog } from '@/catalog/collections';
import { functionsCatalog } from '@/catalog/functions';
import { parallelCatalog } from '@/catalog/parallel';
import { reflectCatalog } from '@/catalog/reflect';
import { transformCoreCatalog } from '@/catalog/transform-core';
import { typesCatalog } from '@/catalog/types';

/**
 * Behaviour suite for the catalog.
 *
 * The type system already refuses a code outside its file's range and a code
 * written twice in one file; the compile-time suite proves that. What only a
 * runtime check can see is the merge: a spread keeps the last of two equal
 * keys without a word, so the files are checked against each other here.
 */

/** Each package's catalog, with the leading digit its codes must carry. */
const RANGES = [
	['@fulcro/collections', '1', collectionsCatalog],
	['@fulcro/functions', '2', functionsCatalog],
	['@fulcro/parallel', '3', parallelCatalog],
	['@fulcro/reflect', '4', reflectCatalog],
	['@fulcro/transform-core', '5', transformCoreCatalog],
	['@fulcro/types', '6', typesCatalog],
] as const;

/** The spelling every code follows. */
const CODE = /^FULCRO\d{4}$/;

describe('catalog', () => {
	it.each(RANGES)(
		"%s's codes should all sit in range %sxxx",
		(_name, digit, codes) => {
			for (const code of Object.keys(codes)) {
				expect(code).toMatch(CODE);
				expect(code[6]).toBe(digit);
			}
		},
	);

	it('should lose no code when the ranges are merged', () => {
		const total: number = RANGES.reduce(
			(sum, [, , codes]) => sum + Object.keys(codes).length,
			0,
		);

		expect(Object.keys(catalog)).toHaveLength(total);
	});

	it('should give every code a template that produces text', () => {
		for (const [code, definition] of Object.entries(catalog)) {
			const values: string[] = Array.from(
				{ length: definition.message.length },
				() => 'value',
			);

			const text: string = (
				definition.message as (...values: string[]) => string
			)(...values);

			expect(text.length, code).toBeGreaterThan(0);
			expect(text, code).not.toMatch(/^FULCRO\d{4}/);
		}
	});
});
