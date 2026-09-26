import { collectionsCatalog } from './collections';
import { functionsCatalog } from './functions';
import { parallelCatalog } from './parallel';
import { reflectCatalog } from './reflect';
import { transformCoreCatalog } from './transform-core';
import { typesCatalog } from './types';

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
	...parallelCatalog,
	...reflectCatalog,
	...transformCoreCatalog,
	...typesCatalog,
} as const;

/** The catalog's type, which every signature in this package is derived from. */
export type Catalog = typeof catalog;
