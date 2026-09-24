# @fulcro/collections

## 0.10.0

### Patch Changes

- Updated dependencies [dc993b2]
  - @fulcro/transform-core@0.10.0

## 0.9.0

### Patch Changes

- @fulcro/transform-core@0.9.0

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

### Minor Changes

- e8d5d86: Thirty-three operators reach the asynchronous sequence.

  **Terminals**: `sum`, `average`, `min`, `max`, `minBy`, `maxBy`, `contains`,
  `single`, `singleOrNull`, `elementAt`, `sequenceEqual`, `countBy`, `toMap`,
  `toLookup`, `standardDeviation`, `sampleStandardDeviation`.

  **Deferred**: `append`, `prepend`, `defaultIfEmpty`, `pairwise`, `windowed`,
  `takeLast`, `skipLast`, `groupAdjacent`, `zip`, `except`, `exceptBy`,
  `intersect`, `intersectBy`, `union`, `unionBy`, `join`, `groupJoin`.

  They are written for streams rather than delegated to the synchronous ones. The
  terminals that can stop do — `contains` leaves the source where it found the
  value, `single` at the second element, `sequenceEqual` at the first difference.
  The windows hold a window: `windowed`, `pairwise`, `skipLast` and
  `groupAdjacent` all yield over an endless source. The set operations and joins
  read their **argument** whole, never the sequence they are called on, and a join
  indexes the inner side once rather than scanning it per element.

  `standardDeviation` accumulates each value as it arrives instead of collecting
  them to find a mean and revisiting them, which also keeps it accurate on values
  far from zero where the textbook formula loses precision to cancellation.

  **Six are deliberately absent**: `orderBy`, `orderByDescending`, `reverse`,
  `groupBy`, `median` and `percentile`. Each must hold the entire source before it
  can produce anything, and offering them here would be a memory trap wearing an
  ordinary operator's clothes. Reach for `toArray()` and the synchronous sequence,
  where holding everything is visible in the code.

  One consequence worth knowing: `groupAdjacent` and `groupJoin` hand back the
  same `Group` and `Sequence` their synchronous counterparts do, so a bundle
  importing only `@fulcro/collections/async` now carries the synchronous sequence
  as well.

### Patch Changes

- @fulcro/transform-core@0.7.0

## 0.6.0

### Minor Changes

- d99e36a: `ofType<T>()` and `cast<T>()` handle types that contain themselves.

  A comment tree, a folder structure, a category with subcategories — ordinary
  shapes that were refused until now. A type referring back to itself becomes a
  function that calls itself:

  ```ts
  interface Comment {
  	id: number;
  	text: string;
  	replies: Comment[];
  }

  comments.cast<Comment>();
  ```

  The function is built once, where the call sits rather than per element, and it
  adds no name to the surrounding scope. Cycles running through a second type work
  the same way, so `Author` holding `Post[]` holding an `Author` is one cycle and
  gets one function.

  It descends the whole value: a reply four levels down with a wrong field is
  rejected like any other.

  Index signatures, unresolved generics and `import type` classes are still
  refused, and still loudly.

### Patch Changes

- @fulcro/transform-core@0.6.0

## 0.5.0

### Minor Changes

- eac41e4: The shaping operators reach the asynchronous sequence: `choose`, `ofType`,
  `cast`, `topBy` and `tap`, plus `chooseAwait` and `topByAwait`.

  They are written for streams rather than adapted from the synchronous ones. The
  plain forms pull one element at a time, so back pressure is intact; the `Await`
  forms overlap the waiting with a bounded concurrency.

  `cast<T>()` is the reason this matters. Untrusted data usually arrives
  asynchronously, and the synchronous path meant collecting all of it first:

  ```ts
  const orders = AsyncSequenceCollection.from(paginatedOrders()).cast<Order>();
  ```

  It refuses at the element that failed, so a bad page is caught without the rest
  of the feed being fetched. Interfaces are written out as checks here exactly as
  they are on the synchronous sequence.

  `topBy` ranks a stream without collecting it: what it holds is bounded by
  `count`, not by the length of the source. `topByAwait` extracts keys
  concurrently, and ties still break on arrival — recorded before the keys are
  extracted, since concurrent work finishes in an order that has nothing to do
  with the input.

### Patch Changes

- @fulcro/transform-core@0.5.0

## 0.4.0

### Minor Changes

- e11c9a5: `ofType<T>()` and `cast<T>()` can be written as types — including interfaces.

  `@fulcro/collections` ships its own compile time transformer, at
  `@fulcro/collections/transformer` and `@fulcro/collections/unplugin`. A
  primitive becomes the `typeof` name, a class becomes its constructor, and an
  interface — which has neither — is **written out as the checks its properties
  imply**, nested to any depth.

  That makes `cast<T>()` a validator for untrusted data derived from the type
  itself:

  ```ts
  const orders = SequenceCollection.from(await response.json())
  	.cast<Order>()
  	.toArray();
  ```

  Covered: primitives, literals, unions, intersections, objects and interfaces,
  optional properties, arrays (every element), fixed-length tuples, classes, and
  the built-in classes by `instanceof`. Extra properties are accepted, as
  structural typing accepts them.

  Refused, deliberately: recursive types, index signatures, unresolved generics,
  and classes imported with `import type`. A check that answers yes to the wrong
  thing is worse than no check, so anything that cannot be written out completely
  is left for the runtime to reject out loud.

  The plugin is optional — every operator works without it, and only the
  no-argument forms need it.

  `@fulcro/transform-core` gained a `callForm` on its rewriters, which is what
  lets one claim `something.method()` rather than an imported function.

### Patch Changes

- Updated dependencies [e11c9a5]
  - @fulcro/transform-core@0.4.0

## 0.3.0

### Minor Changes

- cd517e0: Five operators: `choose`, `ofType`, `cast`, `topBy` and `tap`.

  `topBy(keySelector, count)` answers what `orderByDescending(...).take(count)`
  answers — same elements, same order, ties broken the same way — while keeping
  only a window of the best `count` seen so far. Measured over a hundred thousand
  records for a top ten: 201,400 key comparisons against 4,532,640 for the sort.

  `choose` projects and filters in one pass, for the case where the condition and
  the projection are the same work. `ofType` narrows a mixed sequence to one
  runtime type and `cast` does the same but throws on the first element that does
  not fit. `tap` observes a chain without consuming it.

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

- The operator set is complete, and there is now an asynchronous half.

  **Thirty-one operators complete the standard set.** Quantifiers and element
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

  **Seven operators beyond the standard set.** `memoize` makes a sequence over a
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
