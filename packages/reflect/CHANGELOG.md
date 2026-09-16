# @fulcro/reflect

## 0.8.1

### Patch Changes

- b41f509: Documentation only, plus a regression test for the two plugins together.

  The documentation index described the library as it stood two releases ago: it
  mentioned none of `is`, `as`, `cast`, `ofType`, `topBy` or `choose`, so the most
  distinctive thing here — a runtime check derived from the type you already wrote
  — was invisible from the front door.

  Nothing in the packages changed.

- @fulcro/transform-core@0.8.1

## 0.8.0

### Minor Changes

- ea4b0d3: `is<T>()` and `as<T>()` check a single value against a type.

  Structural validation was only reachable through a sequence, which meant
  wrapping one value in a collection to ask about it. These ask directly:

  ```ts
  if (is<Order>(payload)) {
  	payload.total; // narrowed, and actually verified
  }

  const order = as<Order>(await response.json());
  ```

  `is` is a type guard, for when a failure should branch. `as` is the checked
  counterpart of the language's own `as` — which asserts without verifying — and
  returns the value unchanged or throws.

  A failing `as` names **where** it stopped matching:

  ```text
  TypeError: as<Order>() refused a value: customer.email: expected string, got number
  ```

  That comes from a second walker the transformer emits beside the fast check, and
  it runs only once the check has already refused, so a passing value never pays
  for it. `is` carries no walker, since a branch needs yes or no.

  The structural generator moved to `@fulcro/transform-core`, so the sequences and
  these share one implementation rather than two that could drift. Nothing about
  `ofType` or `cast` changed.

  Index signatures and unresolved generics are refused, loudly. Pass a test of
  your own for those.

### Patch Changes

- Updated dependencies [ea4b0d3]
  - @fulcro/transform-core@0.8.0

## 0.7.0

### Patch Changes

- @fulcro/transform-core@0.7.0

## 0.6.0

### Patch Changes

- @fulcro/transform-core@0.6.0

## 0.5.0

### Patch Changes

- @fulcro/transform-core@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [e11c9a5]
  - @fulcro/transform-core@0.4.0

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

### Patch Changes

- Updated dependencies [597a05c]
  - @fulcro/transform-core@0.3.0

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
