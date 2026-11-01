import type { TransformerUnplugin } from '@fulcro/transform-core/unplugin';
import { createTransformerUnplugin } from '@fulcro/transform-core/unplugin';

import { escapeRewriter } from '@/src/transformer/escape/index.js';
import { ANALYZERS } from '@/src/transformer/index.js';

/**
 * Bundler plugin checking `move`, `borrow` and `borrowMutable` at build time,
 * and allocating from a frame what cannot outlive its block — the same
 * transformer as `@fulcro/memory/transformer`.
 *
 * The same integration serves Vite, Rollup, Webpack, esbuild, Rspack and Farm,
 * and through them the frameworks layered on top:
 *
 * ```ts
 * import { vite as fulcroMemory } from '@fulcro/memory/unplugin';
 *
 * export default defineConfig({ plugins: [fulcroMemory()] });
 * ```
 *
 * It must run **before** the bundler erases the types, which is why the plugin
 * declares `enforce: 'pre'`: telling a call to this package's `move` from any
 * other function of that name takes the checker.
 */

const plugins = createTransformerUnplugin([], 'fulcro-memory', ANALYZERS, [escapeRewriter]);

export type { PluginOptions } from '@fulcro/transform-core/unplugin';

/** The factory itself, for a bundler not covered below. */
export const unpluginFactory: TransformerUnplugin['unpluginFactory'] = plugins.unpluginFactory;

/** Adapter for Vite, which is also what vitest runs on. */
export const vite: TransformerUnplugin['vite'] = plugins.vite;

/** Adapter for Rollup. */
export const rollup: TransformerUnplugin['rollup'] = plugins.rollup;

/** Adapter for Webpack. */
export const webpack: TransformerUnplugin['webpack'] = plugins.webpack;

/** Adapter for Rspack. */
export const rspack: TransformerUnplugin['rspack'] = plugins.rspack;

/** Adapter for esbuild. */
export const esbuild: TransformerUnplugin['esbuild'] = plugins.esbuild;

/** Adapter for Farm. */
export const farm: TransformerUnplugin['farm'] = plugins.farm;
