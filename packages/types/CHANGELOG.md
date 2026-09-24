# @fulcro/types

## 0.4.0

### Minor Changes

- 818d049: `@fulcro/types` no longer rewrites the JavaScript operators, and ships no compiler plugin: the `./transformer`, `./unplugin` and `./language-service` entry points are gone, along with its dependency on `@fulcro/transform-core` and its peer dependency on `typescript`. Every operation is a typed method that needs nothing configured — `a.add(b)` on a `Decimal`, `SignedInteger(32).add(a, b)` on an integer — in every editor and every build. `@fulcro/transform-core` drops the machinery that rewrote a program before type checking, which nothing else used.

  **Breaking, and released as a minor**, which the pre-1.0 convention allows. Remove the `@fulcro/types/transformer` and `@fulcro/types/language-service` entries from your tsconfig `plugins`, and the `@fulcro/types/unplugin` adapter from your bundler, then write each operator on these types as its method.

## 0.3.0

### Minor Changes

- c5ac603: `struct()` takes an optional third argument of methods, which every value of the struct carries through one shared prototype — with `this` as the value, no bytes taken, and the layout, `equals` and the byte encoding unchanged. For a struct that declares methods, `is` also requires the value to have been made by the struct; a struct without methods behaves exactly as before.

## 0.2.0

### Minor Changes

- 86b9818: Add `struct`, a value type with a fixed layout built from the numeric types and from other structs: `const Vector3 = struct('Vector3', { x: SinglePrecisionFloat, … })` and `type Vector3 = Struct<typeof Vector3>`. Values are frozen and compared by field, `sizeOf` and `alignOf` read a struct's layout at compile time, and `write`/`read` store a value in a `DataView`, little-endian, with `Decimal` as decimal128.

## 0.1.0

### Minor Changes

- a66c59f: Introduce `@fulcro/types`: numeric types with a declared range and layout.

  `SignedInteger<N>` and `UnsignedInteger<N>` for 8 to 128 bits, with checked
  arithmetic and an explicit `wrap`; `HalfPrecisionFloat`, `SinglePrecisionFloat`
  and `DoublePrecisionFloat`, each operation rounded once into its format;
  `BigInteger`; and `Decimal`, with the semantics of IEEE 754 decimal128 and five
  rounding modes. Every type has a value of the same name, and a type-only import
  loads no code.

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

### Patch Changes

- Updated dependencies [dc993b2]
  - @fulcro/transform-core@0.10.0
