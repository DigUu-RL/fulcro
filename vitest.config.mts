import { defineConfig, type ViteUserConfig } from 'vitest/config';

import { vite as collectionsTransformer } from '@fulcro/collections/unplugin';
import { vite as reflectTransformer } from '@fulcro/reflect/unplugin';

/**
 * Test harness of the whole workspace.
 *
 * Testing is owned by the root rather than by each package. The suites of
 * `@fulcro/reflect` only mean something with its transformer applied —
 * `defaultOf` throws without it — and the plugin is a build time concern, so
 * wiring it here keeps it out of the manifest of every package that only needs
 * it while its own tests run.
 *
 * The plugin now comes from `@fulcro/reflect` itself rather than from a package
 * beside it: each library ships the transformer for its own utilities, so there
 * is nothing extra to install and no way for the two halves to drift apart in
 * version.
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

	// The type aware utilities are resolved by a transformer, which needs a type
	// checker. Without these the suites would exercise only the runtime
	// fallbacks: `defaultOf` would throw, and so would `ofType<T>()`.
	//
	// Both are applied to every project, and they do not interfere: each claims
	// only the calls whose declarations it can trace back to its own package, so
	// a project using neither is left untouched by both.
	plugins: [reflectTransformer(), collectionsTransformer()],

	// The `@/*` alias is declared once, in the tsconfig of each package, and
	// read back from there rather than repeated as a Vite alias — so a path the
	// compiler resolves and one the test runner resolves can never drift apart.
	resolve: { tsconfigPaths: true },

	test: {
		name,
		globals: true,
		include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],

		// Vitest prints a hint on every run suggesting `fsModuleCache: true`.
		// Do not take it. The cache keys on the content of the source files, and
		// the plugin above rewrites those files based on code that lives in this
		// same repository — so a change to the transformer leaves every cached
		// transform untouched and the suites go on asserting against output the
		// transformer no longer produces.
		//
		// This was measured, not assumed. With the cache on, breaking the
		// `defaultOf` rewriter outright — making it decline every call — left all
		// 31 reflect tests passing. With it off, the same break failed 11 of them
		// with the error the runtime fallback is supposed to throw.
		//
		// A few seconds a run is not worth a suite that lies about the one
		// component this repository exists to build.
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
		// The root of `tests` only: the folders below it are their own projects,
		// and running them under this name would misdescribe what they check.
		include: ['tests/*.spec.mts'],
	},
});

/**
 * The compile time plugins applied together, as a consumer using both
 * libraries applies them.
 *
 * Its own project rather than part of the entry point suite: what it checks is
 * not a published surface but whether two transformers can walk one tree
 * without treading on each other. It applies them itself, so no plugin is wired
 * in here.
 *
 * @returns The project configuration.
 */
const transformers = (): ViteUserConfig => ({
	test: {
		name: 'transformers',
		globals: true,
		include: ['tests/transformers/**/*.spec.mts'],
	},
});

/**
 * The repository's own safety hooks.
 *
 * Its own project for the same reason the transformers have one: what it
 * checks is not the library at all. These suites call the guards under
 * `.claude/hooks` directly — a guard is a function from a command line to a
 * reason — so the blocking behaviour is verifiable without a model, without a
 * session and without running any of the commands in question.
 *
 * @returns The project configuration.
 */
const hooks = (): ViteUserConfig => ({
	test: {
		name: 'hooks',
		globals: true,
		include: ['tests/hooks/**/*.spec.mts'],
	},
});

/**
 * The validators of the repository's own `.claude` tree.
 *
 * Its own project, beside the hooks and for the same reason: what it checks is
 * not the library. The suites build a `.claude` tree in a temporary directory
 * and ask the validators what they found, so both halves of every check — what
 * it refuses and what it must keep allowing — are exercised without a model and
 * without this repository having to contain a broken skill.
 *
 * @returns The project configuration.
 */
const claude = (): ViteUserConfig => ({
	test: {
		name: 'claude',
		globals: true,
		include: ['tests/claude/**/*.spec.mts'],
	},
});

export default defineConfig({
	test: {
		projects: [
			project('collections'),
			project('functions'),
			project('parallel'),
			project('reflect'),
			project('types'),
			entryPoints(),
			transformers(),
			hooks(),
			claude(),
		],
	},
});
