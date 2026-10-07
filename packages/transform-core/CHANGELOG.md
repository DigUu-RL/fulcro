# @fulcro/transform-core

## 1.3.0

### Minor Changes

- 8c40c25: Every error now carries `details`: the values its message was written from, by name and frozen, always with the `operation` that failed — `error.details.index` instead of reading the number back out of the message. Recognise one with `isFulcroError(error, 'FULCRO7002')`, which narrows `details` to that code's fields, or with `error instanceof FulcroError`; the built-in class (`RangeError`, `TypeError`) is unchanged, and `DetailsOf<'FULCRO7002'>` names one code's details. Messages and classes are unchanged. **Breaking, in `@fulcro/errors` only:** `createError(code, ...values)` is now `createError(code, details)`, so `createError('FULCRO6021', 'Vector3.from', 'x')` becomes `createError('FULCRO6021', { operation: 'Vector3.from', field: 'x' })`. `CodedError` remains as a deprecated name for `FulcroError`.
- 1fc85fa: A transformer can now check a whole file without rewriting it: `createTransformer`, `createFileTransformer` and `createTransformerUnplugin` take a list of `FileAnalyzer`s, run once per file before any rewriter. A call target can name the package that must declare it (`packageName`), so a library laid out as `<utility>/index` no longer claims a consumer's own function of the same name and folder. A file nothing rewrote now comes back from the bundler core as `null`, keeping the original and its source map.

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

### Minor Changes

- 818d049: `@fulcro/types` no longer rewrites the JavaScript operators, and ships no compiler plugin: the `./transformer`, `./unplugin` and `./language-service` entry points are gone, along with its dependency on `@fulcro/transform-core` and its peer dependency on `typescript`. Every operation is a typed method that needs nothing configured — `a.add(b)` on a `Decimal`, `SignedInteger(32).add(a, b)` on an integer — in every editor and every build. `@fulcro/transform-core` drops the machinery that rewrote a program before type checking, which nothing else used.

  **Breaking, and released as a minor**, which the pre-1.0 convention allows. Remove the `@fulcro/types/transformer` and `@fulcro/types/language-service` entries from your tsconfig `plugins`, and the `@fulcro/types/unplugin` adapter from your bundler, then write each operator on these types as its method.

## 0.10.0

### Minor Changes

- dc993b2: Give the JavaScript operators their meaning on the numeric types of
  `@fulcro/types`.

  With the plugin wired up — `@fulcro/types/transformer` for `tsc` (through
  `ts-patch`, with `"transformProgram": true`), `@fulcro/types/unplugin` for a
  bundler, `@fulcro/types/language-service` for the editor — every operator on
  every numeric type becomes the operation it means for that type: `+ - * / % **`,
  unary `-` and `+`, `++` and `--`, every compound assignment, the comparisons,
  the equalities and, on the fixed-width integers, the bit operators. The result
  keeps its type, and operands of different types are a type error at the line.
  Evaluation order, prefix and postfix values, and single evaluation of a
  compound assignment's target are those of the operator replaced.

  **Behaviour change on `Decimal`:** with the plugin, `===` and `!==` between two
  decimals compare values rather than references.

  The descriptors gain the operations the operators need — `power`, `negate`,
  `increment`, `decrement`, the comparisons, and on integers the bit operations
  and shifts — and `Decimal` gains `power`. Every type with a range now reports
  `minimum` and `maximum`, through the new `BoundedNumericType`; `Decimal` has
  them as statics.

  **Breaking for `BigInteger`:** it is now branded, so a plain `bigint` has to go
  through `BigInteger.from` before it is one. This is what lets the operators be
  rewritten on a `BigInteger` without touching every other `bigint` in a program.

  `@fulcro/transform-core` gains the machinery this rests on: a rewrite of source
  text before type checking, with a position map back to the original, run to a
  fixed point over the whole program, and its `tsc`, bundler and language service
  integrations.

## 0.9.0

No changes in this release.

## 0.8.1

No changes in this release.

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

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

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
