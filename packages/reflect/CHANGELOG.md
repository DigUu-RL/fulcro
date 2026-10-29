# @fulcro/reflect

## 2.0.0

### Major Changes

- 3b1d05f: Ship every package as an ES module only, built by tsdown, and require Node 22.12 or later.

  What breaks:

  - **No CommonJS build**, where `@fulcro/parallel` already had none. `require('@fulcro/…')` on Node older than 22.12 fails. On 22.12 and later it still works, through Node's `require` of an ES module, so a compiler plugin loader that calls `require` keeps loading `./transformer`.
  - **A CommonJS TypeScript project compiled with `module: node16`** gets TS1479 on every `@fulcro/…` import, as it already did on `@fulcro/parallel`'s, since that setting does not let a CommonJS file `require` an ES module. Under `module: nodenext` the same imports compile, and so they do under `moduleResolution: node10`.
  - **`engines` is `>=22.12`** (was `>=22`).
  - **`./unplugin` ships `.js` and `.d.ts`** (was `.mjs` and `.d.mts`). The subpath is the same, so an import through it is unaffected; a path that reached into `dist` directly has to follow.

  What improves: the declarations ship with declaration maps and the TypeScript sources they point at, without the suites, so Go to Definition in an editor lands in the source rather than in a `.d.ts`. And the `./unplugin` adapters of `@fulcro/collections`, `@fulcro/reflect` and `@fulcro/memory` are now declared with `TransformerUnplugin` from `@fulcro/transform-core`. Their declarations used to name `WebpackPluginInstance`, `RspackPluginInstance`, `EsbuildPlugin` and `JsPlugin` without importing them, so an editor showed those adapters as `any`.

- 86d6e60: - `@fulcro/reflect`: `TypeLayout<T>['fields']` for a type whose layout lists no fields is `Readonly<Record<string, never>>`, every field name leading to nothing, instead of `{}`, which stood for any value at all.
  - `@fulcro/types`: the methods parameter of a struct's descriptor no longer defaults to `{}`. `StructType<TFields>` written without methods now means methods in general, and the descriptor of a struct declared without methods carries, as its second argument, a marker that holds one optional slot, `'~noMethods'`, and no method. Every struct still assigns to `StructType<any>`, to `StructType<Record<string, any>>` and to `StructType<TFields>` of its own fields, with methods or without, and the values of every struct are typed exactly as before.

    What can break: code that reads the methods argument back out of a descriptor. `typeof Plain extends StructType<infer F, infer M>` infers `M` as that marker where it inferred `{}`, so `keyof M` is `'~noMethods'` rather than `never`; and an editor shows the marker as the second argument of `typeof Plain`. `Struct<typeof Plain>` is the way to ask for a struct's values, and it is unchanged.
- 4416d08: The utilities whose type argument the transformer reads now say, in what they return, what that type argument is for:

  - `sizeOf<T>()` returns `TypeLayout<T>['size']` and `alignOf<T>()` returns `TypeLayout<T>['alignment']`: the number literal the layout of `T` declares, the same one `layoutOf<T>()` reports, instead of `number`. `let size = sizeOf<Point>(); size += 4` stops compiling, since `size` is typed as that literal; a variable that accumulates sizes is annotated `: number`.
  - `nameOf<T>()` returns `TypeName<T>`, a `string` carrying the type it names. It is still assignable to `string`, and a plain string can still be assigned to it.
  - `typeOf<T>()` returns `TypeMetadata<T>`, and `pathsOf<T>()` takes and returns `readonly TypePath<T>[]`. Both default their parameter to `unknown`, so `TypeMetadata` and `TypePath` written without one keep their meaning, and the metadata or paths of one type no longer pass for another's.
  - `defaultOf<T>()` returns `Defaulted<T>`, which is `T`: `const order: Order = defaultOf()` still infers `Order`.
  - `TypeTest<R>`, in `@fulcro/reflect`, `@fulcro/collections` and `@fulcro/transform-core` alike, carries the type it vouches for. The three stay assignable to one another: they share `matches` and the optional `name` and `'~type'`, and only `@fulcro/collections`' leaves out the optional `explain`. A `TypeTest<Account>` is no longer accepted where a `TypeTest<User>` is asked for. It never vouched for one, and the transformer's own tests are unaffected.

  `TypeName` and `Defaulted` are new exports of `@fulcro/reflect`. The runtime is unchanged, and so is everything the transformers emit.

- f72897a: Require TypeScript 5.9 or later for the transformers: the optional `typescript` peer is now `>=5.9 <7` (was `>=5.3.3 <7`).

  The transformers tell a type-only import apart through the compiler's `phaseModifier`, which replaced the deprecated `isTypeOnly` and first appears in 5.9. The runtime halves of these packages need no compiler, but npm checks the peer range on install all the same, observed with npm 11:

  - a project whose `typescript` range admits 5.9, such as `^5.8.3`, has its installed compiler moved up to the newest 5.x by the install, without being asked;
  - a project pinned below 5.9, such as `"typescript": "5.8.3"`, is refused with `ERESOLVE`. With `--legacy-peer-deps` the install goes through, the compiler stays where it was, and the runtime halves work; the transformers need 5.9.

### Patch Changes

- Updated dependencies [3b1d05f]
- Updated dependencies [f72897a]
- Updated dependencies [4416d08]
- Updated dependencies [f72897a]
  - @fulcro/errors@3.0.0
  - @fulcro/transform-core@2.0.0

## 1.3.0

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
- Updated dependencies [1fc85fa]
  - @fulcro/errors@2.0.0
  - @fulcro/transform-core@1.3.0

## 1.2.0

### Minor Changes

- b9b4ce1: `@fulcro/types` gains the mathematics types: `Matrix`, `Vector`, `Fraction`,
  `ComplexNumber` and `Quaternion`, each declared over any numeric type of the
  package — or over one another — and doing its arithmetic through that type's
  descriptor. Dimensions are type parameters: `Matrix(SinglePrecisionFloat, 3, 4)`
  multiplies a vector of 4 rows, and a product whose shapes do not meet does not
  compile, with no plugin. When the element type has a layout, so does the type
  built on it, so it can be a struct's field and `sizeOf` reads it.

  `@fulcro/reflect` gains `constantOf(() => …)`: with the transformer, the
  function runs while the program compiles and the call is replaced by a frozen
  literal of its result; without it, the function runs at runtime with the same
  answer. A function the transformer cannot prove constant is a compile error at
  the call, never a silent fallback.

  `@fulcro/transform-core` lets a rewriter refuse a call as a compile error:
  through `ts-patch`'s `addDiagnostic` where it is available, and as
  `FULCRO5003` listing every refusal of a file otherwise. The transformer factory
  takes `ts-patch`'s extras as a third argument.

  `@fulcro/errors` registers `FULCRO4010`–`FULCRO4014`, `FULCRO5003` and
  `FULCRO6033`–`FULCRO6042`.

### Patch Changes

- Updated dependencies [b9b4ce1]
  - @fulcro/transform-core@1.2.0
  - @fulcro/errors@1.1.0

## 1.1.0

### Minor Changes

- e257819: `offsetOf<T>(field)` and `layoutOf<T>()` answer where a struct's fields sit, at
  compile time: `offsetOf<Vector3>('y')` becomes `4`, and `layoutOf<Vector3>()`
  becomes a frozen object equal to `Vector3.layout`. A name that is not a field is
  a type error. The layout of a struct value's type now also lists each field's
  size and alignment, in declaration order, which is what the transformer places
  the fields from — including for a struct imported from a built package.
  `FULCRO4009` names the two new utilities in its message.

### Patch Changes

- Updated dependencies [e257819]
  - @fulcro/errors@1.0.1
  - @fulcro/transform-core@1.1.0

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
  - @fulcro/transform-core@1.0.0

## 0.11.0

### Patch Changes

- Updated dependencies [818d049]
  - @fulcro/transform-core@0.11.0

## 0.10.0

### Minor Changes

- a66c59f: Add `sizeOf<T>()` and `alignOf<T>()`, which read the size and alignment a type
  declares and are replaced by the number at compile time.

  A type declares a layout by carrying a `'~layout'` property with literal `size`
  and `alignment`, as every fixed-layout type of `@fulcro/types` does. A type
  without one is a type error at the call; a generic parameter, or a union of
  different layouts, is left to throw at runtime, since there is no single number
  to emit.

### Patch Changes

- Updated dependencies [dc993b2]
  - @fulcro/transform-core@0.10.0

## 0.9.0

### Minor Changes

- 4fce768: Four new utilities: `pathOf`, `keysOf<T>()`, `typeOf<T>()` and `pathsOf<T>()`.

  **`pathOf`** answers with the whole path where `nameOf` answers with the last
  segment:

  ```ts
  nameOf(() => user.profile.email); // 'email'
  pathOf(() => user.profile.email); // 'profile.email'
  pathOf(() => order.items[0].sku); // 'items[0].sku'
  ```

  The root is dropped, because the path is relative to it. Resolved to a literal
  with the transformer, parsed from the closure source without it.

  **`keysOf<T>()`** lists the keys a type declares. Deliberately not
  `Object.keys`: structural typing lets a value carry more than its type declares,
  which is why `Object.keys` returns `string[]` rather than `(keyof T)[]`. This
  never looks at a value.

  **`typeOf<T>()`** is the generic counterpart of `typeOf(value)`. That describes
  what a value is; this describes what a type says — name, kind, declaration site,
  and the members with their types, optionality and readonly-ness. It also reports
  the branches of a union and the element of an array. The two forms are told apart
  by having an argument or not, so `typeOf(undefined)` keeps working.

  `members` is what a separate `membersOf<T>()` would have returned; one question,
  one place.

  **`pathsOf<T>()`** lists every leaf a type can be walked to — `customer.email`,
  `items[].sku` — with the type and optionality at each. Three rules keep it
  useful: a primitive is a leaf, a known class is a leaf, and recursion stops at
  the repeat. Without the first, a `string` property yields the whole of
  `String.prototype`.

  The generic form is `pathsOf`, plural, because it answers with a list where
  `pathOf` answers with one.

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
