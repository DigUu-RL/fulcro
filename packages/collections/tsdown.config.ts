import type { UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';

const buildConfiguration: UserConfig = defineConfig({
	// One entry per subpath of `exports`; keep the two in sync.
	entry: ['src/index.ts', 'src/async.ts', 'src/transformer/index.ts', 'src/unplugin/index.mts'],
	outDir: 'dist',
	format: 'esm',
	// The transformer half runs inside a compiler, on Node: it reads files and loads `typescript`.
	platform: 'node',
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
