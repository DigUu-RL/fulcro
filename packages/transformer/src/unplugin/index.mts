import { createUnplugin, type UnpluginFactory } from 'unplugin';

import {
	createFileTransformer,
	type FileTransformer,
	type TransformCoreOptions,
} from '@/transform-core/index.js';

/**
 * Bundler adapters for the type aware transformer.
 *
 * Built on `unplugin`, so the same integration serves Vite, Rollup, Webpack,
 * esbuild, Rspack and Farm — and, through them, the frameworks layered on top.
 * Everything specific to type checking lives in the core this wraps; what is
 * left here is the shape each bundler expects.
 *
 * Emitted as an ES module because `unplugin` ships as one. The core stays
 * CommonJS, since the compiler plugin loads it through `require`, and an ES
 * module importing CommonJS is the direction that works.
 */

/** Options accepted by every adapter. */
export type PluginOptions = TransformCoreOptions;

/**
 * Builds the plugin shared by every bundler.
 *
 * @param options Options of the plugin.
 * @returns The plugin definition consumed by `unplugin`.
 */
export const unpluginFactory: UnpluginFactory<PluginOptions | undefined> = (
	options = {},
) => {
	let transformer: FileTransformer | undefined;

	/**
	 * Resolves the core lazily, so that the root reported by the bundler is
	 * already known when the program is configured.
	 *
	 * @returns The transformer core.
	 */
	const resolve = (): FileTransformer => {
		transformer ??= createFileTransformer(options);
		return transformer;
	};

	return {
		name: 'type-aware-transformer',

		// Ahead of the TypeScript handling of the bundler: once esbuild or swc
		// has erased the types, there is nothing left for the transformer to
		// read.
		enforce: 'pre',

		transformInclude(id: string): boolean {
			return resolve().handles(id);
		},

		transform(code: string, id: string) {
			const transformed: string | null = resolve().transform(id, code);

			return transformed === null ? null : { code: transformed, map: null };
		},

		vite: {
			configResolved(config: { root?: string }): void {
				// The root of the bundler wins over the working directory, which
				// is what makes the plugin behave inside a monorepo.
				if (config.root !== undefined && options.root === undefined)
					transformer = createFileTransformer({
						...options,
						root: config.root,
					});
			},
		},
	};
};

/** The plugin, in every form `unplugin` can produce. */
export const unplugin = createUnplugin(unpluginFactory);

/** Adapter for Vite, which is also what vitest runs on. */
export const vite = unplugin.vite;

/** Adapter for Rollup. */
export const rollup = unplugin.rollup;

/** Adapter for Webpack. */
export const webpack = unplugin.webpack;

/** Adapter for Rspack. */
export const rspack = unplugin.rspack;

/** Adapter for esbuild. */
export const esbuild = unplugin.esbuild;

/** Adapter for Farm. */
export const farm = unplugin.farm;
