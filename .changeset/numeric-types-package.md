---
'@fulcro/types': minor
---

Introduce `@fulcro/types`: numeric types with a declared range and layout.

`SignedInteger<N>` and `UnsignedInteger<N>` for 8 to 128 bits, with checked
arithmetic and an explicit `wrap`; `HalfPrecisionFloat`, `SinglePrecisionFloat`
and `DoublePrecisionFloat`, each operation rounded once into its format;
`BigInteger`; and `Decimal`, with the semantics of IEEE 754 decimal128 and five
rounding modes. Every type has a value of the same name, and a type-only import
loads no code.
