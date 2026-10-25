import { collectionsCatalog } from '@/src/catalog/collections';
import { functionsCatalog } from '@/src/catalog/functions';
import { memoryCatalog } from '@/src/catalog/memory';
import { parallelCatalog } from '@/src/catalog/parallel';
import { reflectCatalog } from '@/src/catalog/reflect';
import { transformCoreCatalog } from '@/src/catalog/transform-core';
import { typesCatalog } from '@/src/catalog/types';

/**
 * Every registered error, keyed by its code.
 *
 * One file per package range, merged here. The ranges cannot overlap — each
 * file is checked against its own leading digit — so a spread never lets one
 * package's code silently replace another's.
 */
export const catalog = {
	...collectionsCatalog,
	...functionsCatalog,
	...memoryCatalog,
	...parallelCatalog,
	...reflectCatalog,
	...transformCoreCatalog,
	...typesCatalog,
} as const;

/** The catalog's type, which every signature in this package is derived from. */
export type Catalog = typeof catalog;
