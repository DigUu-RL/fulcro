---
'@fulcro/collections': major
'@fulcro/errors': major
'@fulcro/functions': major
'@fulcro/memory': major
'@fulcro/parallel': major
'@fulcro/reflect': major
'@fulcro/transform-core': major
'@fulcro/types': major
---

Ship every package as an ES module only, built by tsdown, and require Node 22.12 or later.

What breaks:

- **No CommonJS build**, where `@fulcro/parallel` already had none. `require('@fulcro/…')` on Node older than 22.12 fails. On 22.12 and later it still works, through Node's `require` of an ES module, so a compiler plugin loader that calls `require` keeps loading `./transformer`.
- **A CommonJS TypeScript project compiled with `module: node16`** gets TS1479 on every `@fulcro/…` import, as it already did on `@fulcro/parallel`'s, since that setting does not let a CommonJS file `require` an ES module. Under `module: nodenext` the same imports compile, and so they do under `moduleResolution: node10`.
- **`engines` is `>=22.12`** (was `>=22`).
- **`./unplugin` ships `.js` and `.d.ts`** (was `.mjs` and `.d.mts`). The subpath is the same, so an import through it is unaffected; a path that reached into `dist` directly has to follow.

What improves: the declarations ship with declaration maps and the TypeScript sources they point at, without the suites, so Go to Definition in an editor lands in the source rather than in a `.d.ts`. And the `./unplugin` adapters of `@fulcro/collections`, `@fulcro/reflect` and `@fulcro/memory` are now declared with `TransformerUnplugin` from `@fulcro/transform-core`. Their declarations used to name `WebpackPluginInstance`, `RspackPluginInstance`, `EsbuildPlugin` and `JsPlugin` without importing them, so an editor showed those adapters as `any`.
