import { createTransformerUnplugin } from '@fulcro/transform-core/unplugin';

import { REWRITERS } from '@/transformer/index.js';

/**
 * Bundler plugin resolving `nameOf`, `typeOf` and `defaultOf` at build time.
 *
 * The same integration serves Vite, Rollup, Webpack, esbuild, Rspack and Farm,
 * and through them the frameworks layered on top:
 *
 * ```ts
 * import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
 *
 * export default defineConfig({ plugins: [fulcroReflect()] });
 * ```
 *
 * It must run **before** the bundler erases the types, which is why the plugin
 * declares `enforce: 'pre'`. Once esbuild or swc has stripped them there is
 * nothing left to read.
 */

const plugins = createTransformerUnplugin(REWRITERS, 'fulcro-reflect');

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
