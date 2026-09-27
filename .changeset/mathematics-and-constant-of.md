---
'@fulcro/types': minor
'@fulcro/reflect': minor
'@fulcro/transform-core': minor
'@fulcro/errors': minor
---

`@fulcro/types` gains the mathematics types: `Matrix`, `Vector`, `Fraction`,
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
