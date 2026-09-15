# @fulcro/reflect

## 0.2.1

### Patch Changes

- 22c1f61: Tell people to install the transformer explicitly, rather than trusting their
  package manager to infer it.

  `@fulcro/transformer` is a required peer dependency and always was, but the
  install instructions read `npm install @fulcro/reflect` and left the peer to be
  resolved automatically. npm does that; Yarn does not. A Yarn project therefore
  ended up with `@fulcro/reflect` alone, and the failure is quiet rather than
  loud: `defaultOf` throws, `nameOf` degrades to parsing closures, and
  `typeOf(…).declared` reads `null`.

  The manifest is unchanged — it was already correct. Only the instructions move,
  and they now name both packages, which behaves the same on every package
  manager.

- @fulcro/transformer@0.2.1

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

### Patch Changes

- Updated dependencies [6fa2be2]
  - @fulcro/transformer@0.2.0

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
