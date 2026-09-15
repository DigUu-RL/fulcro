# @fulcro/collections

## 0.2.0

### Minor Changes

- The operator set is complete, and there is now an asynchronous half.

  **Thirty-one operators close the gap with LINQ.** Quantifiers and element
  access — `all`, `contains`, `single`, `singleOrNull`, `elementAt`,
  `elementAtOrNull`, `defaultIfEmpty`, `sequenceEqual`. Sets and partitioning —
  `except`, `concat`, `takeWhile`, `skipWhile`, `takeLast`, `skipLast`, `chunk`,
  `reverse`, `zip`, `append`, `prepend`. Keyed forms, lookups and factories —
  `distinctBy`, `minBy`, `maxBy`, `exceptBy`, `unionBy`, `intersectBy`,
  `countBy`, `groupJoin`, `toLookup`, `toSet`, and the static `range` and
  `repeat`.

  Cardinality carries through all of them where it can be derived, so `count()`
  still answers without a traversal after a chain. `takeLast` and `skipLast` keep
  a window rather than the sequence, so both stay usable on a source larger than
  memory. `zip` stops with whichever side runs out, and never pulls the longer one
  past the pairing.

  **Seven operators LINQ has no answer for.** `memoize` makes a sequence over a
  generator repeatable — without it a second traversal yields nothing, silently,
  because an exhausted iterator cannot be told from an empty one — and runs the
  projections behind it once rather than per traversal. `partition` splits by a
  condition in a single pass. `scan` is `aggregate` that shows its work.
  `windowed`, `pairwise` and `groupAdjacent` handle runs of consecutive elements.
  And four statistics beside the existing aggregates: `median`, `percentile`,
  `standardDeviation` and `sampleStandardDeviation`, the last two under separate
  names because the answers diverge most exactly when the data is small.

  **A new `@fulcro/collections/async` subpath** carries `AsyncSequence`, for data
  that arrives over time — pages of an API, lines of a file, rows from a cursor.
  One rule covers it: deferred operators keep their names and return an
  `AsyncSequence`, terminals keep theirs and return a `Promise` of what they
  returned before. Every projection accepts a plain function as readily as one
  returning a promise. Terminals take an `AbortSignal`. It is a subpath so a bundle
  importing only the synchronous sequence carries none of it.

  **Bounded concurrency** comes with it: `selectAwait`, `whereAwait` and
  `forEachAwait` keep several elements in flight, for work that spends its time
  waiting. `concurrency` is required with no default, because an unbounded one
  fails in production rather than in development. Results come back in input order
  unless asked otherwise, and a rejection stops the run after settling whatever was
  already in flight.

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
