# @fulcro/transform-core

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
