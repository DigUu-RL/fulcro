import type { UserConfig } from 'tsdown';
import { defineConfig } from 'tsdown';

const buildConfiguration: UserConfig = defineConfig({
	// One entry per subpath of `exports`; keep the two in sync.
	entry: ['src/index.ts', 'src/transformer/index.ts', 'src/unplugin/index.mts'],
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
	dts: true,
	sourcemap: true,
	clean: true,
});

export default buildConfiguration;
