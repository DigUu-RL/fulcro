---
'@fulcro/types': minor
---

Add `struct`, a value type with a fixed layout built from the numeric types and from other structs: `const Vector3 = struct('Vector3', { x: SinglePrecisionFloat, … })` and `type Vector3 = Struct<typeof Vector3>`. Values are frozen and compared by field, `sizeOf` and `alignOf` read a struct's layout at compile time, and `write`/`read` store a value in a `DataView`, little-endian, with `Decimal` as decimal128.
