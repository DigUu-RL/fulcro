# @fulcro/errors

## 1.1.0

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

## 1.0.1

### Patch Changes

- e257819: `offsetOf<T>(field)` and `layoutOf<T>()` answer where a struct's fields sit, at
  compile time: `offsetOf<Vector3>('y')` becomes `4`, and `layoutOf<Vector3>()`
  becomes a frozen object equal to `Vector3.layout`. A name that is not a field is
  a type error. The layout of a struct value's type now also lists each field's
  size and alignment, in declaration order, which is what the transformer places
  the fields from — including for a struct imported from a built package.
  `FULCRO4009` names the two new utilities in its message.

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
