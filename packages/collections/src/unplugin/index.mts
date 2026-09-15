import { createTransformerUnplugin } from '@fulcro/transform-core/unplugin';

import { REWRITERS } from '@/transformer/index.js';

/**
 * Bundler plugin resolving `ofType<T>()` and `cast<T>()` at build time.
 *
 * The same integration serves Vite, Rollup, Webpack, esbuild, Rspack and Farm:
 *
 * ```ts
 * import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
 *
 * export default defineConfig({ plugins: [fulcroCollections()] });
 * ```
 *
 * Optional — every operator in this package works without it, and only the
 * no-argument type forms need it. It can sit beside `@fulcro/reflect`'s plugin;
 * each rewrites only the calls it owns.
 *
 * It must run **before** the bundler erases the types, which is why the plugin
 * declares `enforce: 'pre'`.
 */

const plugins = createTransformerUnplugin(REWRITERS, 'fulcro-collections');

export type { PluginOptions } from '@fulcro/transform-core/unplugin';

/** The factory itself, for a bundler not covered below. */
export const unpluginFactory = plugins.unpluginFactory;

/** Adapter for Vite, which is also what vitest runs on. */
export const vite = plugins.vite;

/** Adapter for Rollup. */
export const rollup = plugins.rollup;

/** Adapter for Webpack. */
export const webpack = plugins.webpack;

/** Adapter for Rspack. */
export const rspack = plugins.rspack;

/** Adapter for esbuild. */
export const esbuild = plugins.esbuild;

/** Adapter for Farm. */
export const farm = plugins.farm;
