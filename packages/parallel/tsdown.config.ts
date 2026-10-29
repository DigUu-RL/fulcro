import type { UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';

const buildConfiguration: UserConfig = defineConfig({
	// One entry per subpath of `exports`; keep the two in sync.
	entry: ['src/index.ts', 'src/browser.ts', 'src/worker/entry.ts'],
	outDir: 'dist',
	format: 'esm',
	platform: 'neutral',
	// Neutral, because the pool serves browsers as well as Node, and a neutral build resolves no built-in module. The
	// Node backend and the worker entry still import `node:worker_threads`, which the runtime provides: named here, it
	// stays an import as written instead of being reported as one the build could not find.
	deps: { neverBundle: [/^node:/] },
	tsconfig: 'tsconfig.build.json',
	// Per-module output keeps the declaration files where the transformers look for the utilities they recognise:
	// a call is claimed by the path of the module that declares it.
	unbundle: true,
	// `.js` and `.d.ts` for every entry, `.mts` sources included, so the `exports` map reads the same throughout.
	fixedExtension: false,
	// Declaration maps, so a consumer's Go to Definition lands in the TypeScript source, which `files` ships beside
	// `dist` for that alone. Without them every declaration still names a map, since `sourcemap` is the whole build's,
	// and nothing would have emitted it.
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
});

export default buildConfiguration;
