# @fulcro/types

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
