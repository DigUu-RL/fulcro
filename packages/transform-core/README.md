# @fulcro/transform-core

Shared machinery behind the Fulcro compile time transformers.

**You do not install this.** `@fulcro/reflect` depends on it, and any other
package in the library that grows a transformer will too. It is published
because they depend on it, not because it is meant to be used directly, and its
shape is theirs to change without notice.

If you are looking for the compiler plugin, it lives in the package whose calls
it rewrites:

```json
{ "plugins": [{ "transform": "@fulcro/reflect/transformer" }] }
```

## Why it exists

The library used to ship one transformer, `@fulcro/transformer`, installed
beside `@fulcro/reflect` as a peer dependency. Two things were wrong with that.

**It could go missing.** npm installs peer dependencies and Yarn does not, so a
project could end up with the utilities and no transformer. The failure was
quiet, because the utilities are built to degrade rather than crash: `defaultOf`
throws, `nameOf` falls back to parsing closures, `typeOf(…).declared` reads
`null`. Nothing says _your build is missing a plugin_.

**It could go out of step.** `@fulcro/reflect@0.3` with
`@fulcro/transformer@0.2` was an installable, broken combination, because what a
call means and what it compiles to were versioned separately.

Both disappear when the transformer ships inside the package whose calls it
rewrites. What is left over is the part that belongs to no package in
particular — and that is this one.

## What is in here

Everything with nothing to do with any particular utility:

| Piece                       | Does                                                                        |
| --------------------------- | --------------------------------------------------------------------------- |
| `isOwnedCall`               | Follows a call back to the declaration that owns it, rather than by name    |
| `createTransformer`         | Walks a source file once and hands each call to the rewriter that claims it |
| `createFileTransformer`     | Builds and keeps a program, for the bundlers that have no checker           |
| `createTransformerUnplugin` | The adapter surface Vite, Rollup, Webpack, Rspack, esbuild and Farm expect  |

What lives in each library instead is the part that knows what to **emit** — how
`defaultOf` fills a tuple, how a type argument becomes a runtime test. That
split is why a package can own its compile time behaviour without a second
install, and why two of them can do so without knowing about each other.

## TypeScript 5 and 6 only

```json
{ "typescript": ">=5.3.3 <7" }
```

7.x is the native port, and its package no longer exposes the compiler API this
is built on. Declared as an **optional** peer dependency, so that a project only
using the runtime half of a library never has to install a compiler it is not
going to run.

## Licence

ISC.
