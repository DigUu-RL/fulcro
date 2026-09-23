---
'@fulcro/types': minor
'@fulcro/transform-core': minor
---

Give the JavaScript operators their meaning on the numeric types of
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
