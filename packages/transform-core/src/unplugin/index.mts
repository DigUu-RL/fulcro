import {
	createUnplugin,
	type UnpluginFactory,
	type UnpluginInstance,
} from 'unplugin';

import {
	createFileTransformer,
	type FileTransformer,
	type TransformCoreOptions,
} from '@/program/index.js';
import { type CallRewriter } from '@/shared/index.js';

/**
 * Bundler adapters for the Fulcro transformers.
 *
 * Built on `unplugin`, so the same integration serves Vite, Rollup, Webpack,
 * esbuild, Rspack and Farm — and, through them, the frameworks layered on top.
 * Everything specific to type checking lives in the core this wraps; what is
 * left here is the shape each bundler expects.
 *
 * Nothing here knows which utilities are being rewritten. The owning package
 * passes its own rewriters in, which is what lets `@fulcro/reflect` and
 * `@fulcro/collections` each publish a plugin of their own without either
 * having to know the other exists.
 *
 * Emitted as an ES module because `unplugin` ships as one. The core stays
 * CommonJS, since the compiler plugin loads it through `require`, and an ES
 * module importing CommonJS is the direction that works.
 */

/** Options accepted by every adapter. */
export type PluginOptions = TransformCoreOptions;

/**
 * Every form `unplugin` produces for these options.
 *
 * Named through `UnpluginInstance` rather than `ReturnType<typeof
 * createUnplugin>`, which infers its option type as `unknown` and makes every
 * adapter below reject the options it is actually given.
 */
type Adapters = UnpluginInstance<PluginOptions | undefined>;

/** The adapters a package re-exports from its own `/unplugin` entry point. */
export interface TransformerUnplugin {
	/** The factory itself, for a bundler not covered below. */
	readonly unpluginFactory: UnpluginFactory<PluginOptions | undefined>;

	/** Adapter for Vite, which is also what vitest runs on. */
	readonly vite: Adapters['vite'];

	/** Adapter for Rollup. */
	readonly rollup: Adapters['rollup'];

	/** Adapter for Webpack. */
	readonly webpack: Adapters['webpack'];

	/** Adapter for Rspack. */
	readonly rspack: Adapters['rspack'];

	/** Adapter for esbuild. */
	readonly esbuild: Adapters['esbuild'];

	/** Adapter for Farm. */
	readonly farm: Adapters['farm'];
}

/**
 * Builds the bundler adapters for one set of rewriters.
 *
 * @param rewriters Rewriters of the package publishing the plugin.
 * @param name Name the plugin reports to the bundler, which is what shows up
 * in its logs and timings.
 * @returns Every adapter `unplugin` can produce.
 */
export const createTransformerUnplugin = (
	rewriters: readonly CallRewriter[],
	name: string,
): TransformerUnplugin =>
	createAdapters((options) => createFileTransformer(rewriters, options), name);

/**
 * Builds the adapters around the core of a package.
 *
 * @param build Builds the core for a set of options.
 * @param name Name the plugin reports to the bundler.
 * @returns Every adapter `unplugin` can produce.
 */
const createAdapters = (
	build: (options: PluginOptions) => FileTransformer,
	name: string,
): TransformerUnplugin => {
	const unpluginFactory: UnpluginFactory<PluginOptions | undefined> = (
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
			transformer ??= build(options);
			return transformer;
		};

		return {
			name,

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
					if (config.root !== undefined && options.root === undefined) {
						transformer = build({ ...options, root: config.root });
					}
				},
			},
		};
	};

	const unplugin = createUnplugin(unpluginFactory);

	return {
		unpluginFactory,
		vite: unplugin.vite,
		rollup: unplugin.rollup,
		webpack: unplugin.webpack,
		rspack: unplugin.rspack,
		esbuild: unplugin.esbuild,
		farm: unplugin.farm,
	};
};
