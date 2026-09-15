import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { vite as typeAwareTransformer } from '@fulcro/transformer/unplugin';

/**
 * Test harness of the whole workspace.
 *
 * Testing is owned by the root rather than by each package, and deliberately
 * so. The suites of `@fulcro/reflect` only mean something with the transformer
 * applied — `defaultOf` throws without it — yet making the package depend on
 * `@fulcro/transformer` to test itself would tie the two together in both
 * directions, since the transformer already depends on `@fulcro/reflect` for
 * its fixture. Wiring the plugin here keeps that edge single and lets every
 * published package declare only what its consumers actually need.
 *
 * Each package runs as its own project, rooted at its own directory, so that
 * the `@/*` alias and the program the transformer builds both resolve against
 * the tsconfig of that package instead of a shared one.
 */

/**
 * Describes one package as a test project.
 *
 * @param name Directory of the package under `packages`.
 * @returns The project configuration.
 */
const project = (name: string): ViteUserConfig => ({
	root: `packages/${name}`,

	// The type aware utilities are resolved by the transformer, which needs a
	// type checker. Without this plugin the suites would exercise only their
	// runtime fallbacks, and `defaultOf` would throw.
	plugins: [typeAwareTransformer()],

	// The `@/*` alias is declared once, in the tsconfig of each package, and
	// read back from there rather than repeated as a Vite alias — so a path the
	// compiler resolves and one the test runner resolves can never drift apart.
	resolve: { tsconfigPaths: true },

	test: {
		name,
		globals: true,
		include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
	},
});

/**
 * The packages as a consumer resolves them, rather than as sources.
 *
 * Rooted at the repository rather than at a package, and — unlike every project
 * above — without the transformer plugin. Two reasons. The suite asserts the
 * runtime fallback behaviour, which is what a consumer gets before wiring the
 * transformer up, so applying it here would test the wrong thing. And the suite
 * names all three utilities while checking the exports, which is exactly the
 * trigger that makes the plugin go looking for a tsconfig to build a program
 * from — there is none at this level, by design.
 */
const entryPoints = (): ViteUserConfig => ({
	test: {
		name: 'entrypoints',
		globals: true,
		include: ['tests/**/*.spec.mts'],
	},
});

export default defineConfig({
	test: {
		projects: [
			project('collections'),
			project('functions'),
			project('reflect'),
			project('transformer'),
			entryPoints(),
		],
	},
});
