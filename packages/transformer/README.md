# @diguu/transformer

The compile-time half of [`@diguu/reflect`](../reflect). It rewrites
`nameOf`, `typeOf` and `defaultOf` calls while the types are still there,
turning what the runtime can only guess — and, for `defaultOf`, cannot answer at
all — into an emitted literal.

## Why a transformer at all

TypeScript erases its own type system on the way to JavaScript. Interfaces, type
aliases, generic arguments and the file a type was declared in leave no trace in
the emitted code, so anything a runtime function could report is limited to the
value in front of it. That is why `nameOf` has to parse closures, `typeOf` can
only walk prototypes, and `defaultOf` has nothing whatsoever to work with.

This package runs inside the compiler, where all of it is still available.

## Install

```sh
npm install --save-dev @diguu/transformer
```

`typescript` is a peer dependency, and deliberately so: the transformer reads
`ts.Symbol` and `ts.Type` objects out of your program, and those only match when
both sides are the same copy of the compiler.

Then wire it into whichever of the two build paths you use.

---

## Path 1 — `tsc`, via `ts-patch`

`tsc` does not run third-party transformers on its own. `ts-patch` is what
teaches it to honour the `plugins` entry of a tsconfig.

```sh
npm install --save-dev ts-patch
```

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "@diguu/transformer",
				"type": "program",
			},
		],
	},
}
```

Then build with `tspc` in place of `tsc`:

```jsonc
// package.json
{
	"scripts": {
		"build": "tspc -p tsconfig.json",
	},
}
```

`"type": "program"` is required — the transformer needs the whole program to get
at the type checker, not just one source file.

---

## Path 2 — bundlers, via `unplugin`

Built on [`unplugin`](https://github.com/unjs/unplugin), so one integration
serves Vite, Rollup, Webpack, Rspack, esbuild and Farm — and, through them, the
frameworks layered on top.

```ts
// vite.config.ts
import { vite as fulcro } from '@diguu/transformer/unplugin';

export default defineConfig({
	plugins: [fulcro()],
});
```

```js
// rollup.config.js
import { rollup as fulcro } from '@diguu/transformer/unplugin';

export default { plugins: [fulcro()] };
```

```js
// webpack.config.js
const { webpack: fulcro } = require('@diguu/transformer/unplugin');

module.exports = { plugins: [fulcro()] };
```

`rspack`, `esbuild` and `farm` are exported under their own names and take the
same options.

The plugin declares `enforce: 'pre'`, which matters: once esbuild or swc has
erased the types, there is nothing left for the transformer to read. If your
bundler lets you reorder plugins by hand, keep this one ahead of the TypeScript
handling.

### Why the bundler path carries its own compiler

No bundler has a type checker. esbuild and swc reach TypeScript by _erasing_ its
types, never by resolving them, so handing one of them a transformer would leave
`defaultOf<Order>()` meaning nothing. The plugin therefore builds and keeps its
own TypeScript program.

It is built lazily — on the first file that actually mentions one of the
utilities — so a project that never calls them pays nothing. After that the
program is held open as a language service and reused across rebuilds, so a
watch run re-checks only what changed instead of rebuilding everything on each
keystroke.

---

## Options

Both paths take the same first option; the bundler path adds two more.

| Option        | Default                                  | Meaning                                                                               |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `projectRoot` | the compiler's current directory         | Root that the declaration paths reported by `typeOf` are made relative to.            |
| `tsconfig`    | the nearest one                          | Path of the tsconfig defining the program. **Bundler path only.**                     |
| `root`        | the bundler's root, else `process.cwd()` | Directory the tsconfig search and the program resolve against. **Bundler path only.** |

Under Vite the bundler's own `root` wins over the working directory, which is
what makes the plugin behave correctly inside a monorepo.

## What it rewrites, and what it leaves alone

A call is claimed only when its symbol traces back to the module `@diguu/reflect`
declares it in — matched by declaration, never by name — so an unrelated local
`nameOf` in your code is never touched.

Calls that no rewriter can resolve are left exactly as they were, and the runtime
implementations stay in charge. A project that compiles without this package
keeps working: `typeOf(…).declared` reads `null`, `nameOf` falls back to parsing
the closure, and `defaultOf` throws.

Files under `node_modules` are skipped. The transformer rewrites your sources,
not your dependencies — a published package should already have been built with
its own transformer if it needed one.

## Troubleshooting

**`defaultOf` throws at runtime.** The transformer did not run over that file.
Check that you are building with `tspc` rather than `tsc`, or that the bundler
plugin is registered and not ordered after the TypeScript step.

**`typeOf(…).declared` is `null`, `nameOf` reports a mangled name.** Same cause:
the calls fell through to the runtime implementations. These two degrade quietly
by design, so they are worth checking whenever the setup changes.

**The paths reported by `typeOf` look wrong.** Set `projectRoot` explicitly.
They are made relative to it, and the default — the compiler's working directory
— is not always what you expect inside a monorepo.
