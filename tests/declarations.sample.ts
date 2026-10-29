/**
 * A Node consumer of every entry point, compiled by the entry point suite
 * with the ES2024 library and `@types/node` alone — no DOM — and
 * `skipLibCheck` off, so every published declaration is checked as such a
 * project checks it. Only what is imported here is compiled, so an entry
 * point left out is an entry point nothing checks.
 */
import * as collections from '@fulcro/collections';
import * as asyncCollections from '@fulcro/collections/async';
import * as collectionsTransformer from '@fulcro/collections/transformer';
import * as collectionsUnplugin from '@fulcro/collections/unplugin';
import * as errors from '@fulcro/errors';
import * as functions from '@fulcro/functions';
import * as memory from '@fulcro/memory';
import * as memoryTransformer from '@fulcro/memory/transformer';
import * as memoryUnplugin from '@fulcro/memory/unplugin';
import * as parallel from '@fulcro/parallel';
import * as reflect from '@fulcro/reflect';
import * as reflectTransformer from '@fulcro/reflect/transformer';
import * as reflectUnplugin from '@fulcro/reflect/unplugin';
import * as transformCore from '@fulcro/transform-core';
import * as transformCoreUnplugin from '@fulcro/transform-core/unplugin';
import * as types from '@fulcro/types';

export const entryPoints = [
	collections,
	asyncCollections,
	collectionsTransformer,
	collectionsUnplugin,
	errors,
	functions,
	memory,
	memoryTransformer,
	memoryUnplugin,
	parallel,
	reflect,
	reflectTransformer,
	reflectUnplugin,
	transformCore,
	transformCoreUnplugin,
	types,
];
