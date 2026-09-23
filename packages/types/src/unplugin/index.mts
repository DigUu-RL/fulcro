import { createRewriterUnplugin } from '@fulcro/transform-core/unplugin';

import { OPERATOR_REWRITER } from '@/transformer/rewriter/index.js';

/**
 * Bundler plugin giving the operators their meaning on this package's numeric
 * types, for Vite, Rollup, Webpack, esbuild, Rspack and Farm:
 *
 * ```ts
 * import { vite as fulcroTypes } from '@fulcro/types/unplugin';
 *
 * export default defineConfig({ plugins: [fulcroTypes()] });
 * ```
 *
 * It runs before the bundler erases the types, and it reads the whole program:
 * whether `c + d` in one file is ours depends on how `c` was declared in
 * another.
 */

const plugins = createRewriterUnplugin(OPERATOR_REWRITER, 'fulcro-types');

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
