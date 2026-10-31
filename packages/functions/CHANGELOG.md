# @fulcro/functions

## 3.1.1

### Patch Changes

- c4a43fb: Declare TypeScript 5.4 as the floor of the types, as an optional peer. `equals` types its second value with `NoInfer`, which older compilers lack, so a project on one would fail with TS2304 from inside the package for importing anything from it; with the peer, npm refuses the install with ERESOLVE instead, naming the package and the version it needs. JavaScript projects without TypeScript are unaffected.

## 3.1.0

### Minor Changes

- efb0c3b: Add `equals`, which compares two values by what they hold, and `createEquals`, which makes a variant of it that compares some kinds of value by rules of your own — the descriptor of every type of `@fulcro/types` among them. `@fulcro/errors` registers the two codes `createEquals` refuses its rules with, `FULCRO2002` and `FULCRO2003`.

### Patch Changes

- Updated dependencies [efb0c3b]
  - @fulcro/errors@3.1.0

## 3.0.0

### Major Changes

- 3b1d05f: Ship every package as an ES module only, built by tsdown, and require Node 22.12 or later.

  What breaks:

  - **No CommonJS build**, where `@fulcro/parallel` already had none. `require('@fulcro/…')` on Node older than 22.12 fails. On 22.12 and later it still works, through Node's `require` of an ES module, so a compiler plugin loader that calls `require` keeps loading `./transformer`.
  - **A CommonJS TypeScript project compiled with `module: node16`** gets TS1479 on every `@fulcro/…` import, as it already did on `@fulcro/parallel`'s, since that setting does not let a CommonJS file `require` an ES module. Under `module: nodenext` the same imports compile, and so they do under `moduleResolution: node10`.
  - **`engines` is `>=22.12`** (was `>=22`).
  - **`./unplugin` ships `.js` and `.d.ts`** (was `.mjs` and `.d.mts`). The subpath is the same, so an import through it is unaffected; a path that reached into `dist` directly has to follow.

  What improves: the declarations ship with declaration maps and the TypeScript sources they point at, without the suites, so Go to Definition in an editor lands in the source rather than in a `.d.ts`. And the `./unplugin` adapters of `@fulcro/collections`, `@fulcro/reflect` and `@fulcro/memory` are now declared with `TransformerUnplugin` from `@fulcro/transform-core`. Their declarations used to name `WebpackPluginInstance`, `RspackPluginInstance`, `EsbuildPlugin` and `JsPlugin` without importing them, so an editor showed those adapters as `any`.

### Patch Changes

- Updated dependencies [3b1d05f]
- Updated dependencies [f72897a]
  - @fulcro/errors@3.0.0

## 2.1.0

### Minor Changes

- 8c40c25: Every error now carries `details`: the values its message was written from, by name and frozen, always with the `operation` that failed — `error.details.index` instead of reading the number back out of the message. Recognise one with `isFulcroError(error, 'FULCRO7002')`, which narrows `details` to that code's fields, or with `error instanceof FulcroError`; the built-in class (`RangeError`, `TypeError`) is unchanged, and `DetailsOf<'FULCRO7002'>` names one code's details. Messages and classes are unchanged. **Breaking, in `@fulcro/errors` only:** `createError(code, ...values)` is now `createError(code, details)`, so `createError('FULCRO6021', 'Vector3.from', 'x')` becomes `createError('FULCRO6021', { operation: 'Vector3.from', field: 'x' })`. `CodedError` remains as a deprecated name for `FulcroError`.

### Patch Changes

- Updated dependencies [d83a1ba]
- Updated dependencies [21d09a1]
- Updated dependencies [4eb7eae]
- Updated dependencies [1dfec8b]
- Updated dependencies [7e921ba]
- Updated dependencies [d16fa12]
- Updated dependencies [1cd194e]
- Updated dependencies [8c40c25]
  - @fulcro/errors@2.0.0

## 2.0.0

### Major Changes

- d2a9e86: Add `Result` and `Option`, each handled exhaustively with `handle`, and make `tryCatch` return the new `Result`.

  **Breaking:** a result's value is now `value`, not `data` — replace `result.data` with `result.value`. `Success` and `Failure` now take both type parameters (`Success<T, E>`, `Failure<T, E>`), and a result carries the methods `isSuccess()`, `isFailure()` and `handle()`, so an object literal `{ data, error }` no longer satisfies `Result`; build one with `success(value)` or `failure(error)`. `error === null` still tells the two variants apart.

  New: `success`, `failure`, `ResultCases`; `Option`, `Some`, `None`, `OptionCases`, `some`, `none` and `optionOf`.

## 1.2.0

### Patch Changes

- Updated dependencies [b9b4ce1]
  - @fulcro/errors@1.1.0

## 1.1.0

### Patch Changes

- Updated dependencies [e257819]
  - @fulcro/errors@1.0.1

## 1.0.0

### Major Changes

- c24bd4c: Every error now carries a stable `FULCRO` code, at the start of its message and
  as `error.code`: `TypeError: FULCRO6021: Vector3.from: missing field 'x'.` The
  class of each error is unchanged, so `instanceof` keeps working, but every
  message now starts with its code — code that compares a message as a whole, or
  anchors a pattern at its start, has to be updated. Match on `error.code`
  instead: the code keeps its meaning across releases, while the wording after it
  may improve.

  The codes live in the new `@fulcro/errors` package, which every other package
  depends on. What each one means, and what to write instead, is in
  `docs/errors.md`.

  `@fulcro/parallel`: an error thrown by a task inside a worker now rejects as
  `FULCRO3005` with the task's own message kept after the code; the library's own
  errors cross the worker boundary with their own code and class.

### Patch Changes

- Updated dependencies [c24bd4c]
  - @fulcro/errors@1.0.0

## 0.11.0

No changes in this release.

## 0.10.0

No changes in this release.

## 0.9.0

No changes in this release.

## 0.8.1

No changes in this release.

## 0.8.0

No changes in this release.

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.0

### Minor Changes

- 597a05c: Each library now ships its own compile time transformer.

  `@fulcro/reflect` exposes `@fulcro/reflect/transformer` and
  `@fulcro/reflect/unplugin`. Installing the package is enough; there is no second
  thing to install and no way to end up with the utilities but not the transformer
  that resolves them.

  **Breaking, and released as a minor**, which the pre-1.0 convention allows.
  Point the `plugins` entry of your tsconfig at `@fulcro/reflect/transformer`
  instead of `@fulcro/transformer`, and import bundler adapters from
  `@fulcro/reflect/unplugin`. The transformer itself is unchanged — same options,
  same emitted code.

  **This release also repairs 0.2.1.** That version declares a peer dependency on
  `@fulcro/transformer`, which no longer exists on the registry, so
  `npm install @fulcro/reflect` fails outright with a 404 rather than merely
  warning. There is no peer here to go missing.

  `@fulcro/transformer` is gone. It was a peer dependency, which npm installs and
  Yarn does not, so a project could get the utilities with nothing to resolve them
  and no error to say so; and it versioned separately, so `reflect@0.3` with
  `transformer@0.2` was an installable, broken pair.

  `@fulcro/transform-core` is new, and holds the machinery that belongs to no
  library in particular. You never install it directly.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- 6fa2be2: Two dependency declarations corrected, and a diagnostic made readable.

  **`@fulcro/transformer` no longer claims to support TypeScript 7.** The peer
  range was `>=5.3.3`, which admitted it. 7.x is the native port and its package
  does not expose the compiler API this is built on — `createProgram`,
  `getTypeChecker`, `visitEachChild`, `createPrinter` and the custom transformer
  pipeline are all absent, leaving only `./unstable/*` APIs. The range is
  `>=5.3.3 <7` now, so an install fails where the transformer would not have been
  able to start.

  **`@fulcro/reflect` declares `@fulcro/transformer` as a peer dependency.** These
  utilities read the type, which exists only while the compiler runs; without the
  transformer they fall back to reading the value instead — `typeOf` leaves
  `declared` null, `nameOf` parses the closure, and `defaultOf` throws. That is a
  fallback, not a mode worth choosing, and nothing said so at install time. npm
  installs the peer automatically; in a project that already has TypeScript, which
  is every consumer of these packages, it adds about a megabyte.

  **`switchFor`'s exhaustiveness error names the missing member again.** The
  overloads are reordered so the exhaustive one comes last. When no overload
  matches, TypeScript reports the last candidate taking that many arguments, and
  with the exhaustive form earlier a forgotten enum member produced a complaint
  about `SwitchCase` — the predicate form the caller was not using — with the
  member itself never mentioned. The check worked and the message was useless.

  Only TypeScript 7 words it that way; 5.x picks a best candidate and reads well
  either way, so the suite now compiles its fixture with both.

## 0.1.0

### Minor Changes

- First release.

  - `@fulcro/collections` — lazily evaluated sequences with a composable query
    operator set, index access through a `Proxy`, and sorting that extracts each
    key once per element rather than twice per comparison.
  - `@fulcro/reflect` — `nameOf`, `typeOf` and `defaultOf`, answering what
    TypeScript erases. Each has a runtime implementation, so the package works on
    its own; `defaultOf` is the one that requires the transformer.
  - `@fulcro/functions` — `switchFor`, with an exhaustive form that fails to
    compile when an enum member has no branch, and `tryCatch`, which returns the
    outcome of an operation as a value.
  - `@fulcro/transformer` — resolves the `@fulcro/reflect` utilities at compile
    time, through `ts-patch` for `tsc` and through `unplugin` for Vite, Rollup,
    Webpack, Rspack, esbuild and Farm.

  Released as `0.1.0` rather than `1.0.0`: nothing here has been used by anyone
  outside this repository yet, and `switchFor` alone changed shape twice while it
  was being written. A `0.x` line says that plainly instead of promising a
  stability that has not been earned.
