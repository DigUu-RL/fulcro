---
'@fulcro/types': minor
'@fulcro/memory': minor
---

Store a numeric type as bytes on its own. Every numeric type with a fixed layout — `SignedInteger(n)`, `UnsignedInteger(n)`, `HalfPrecisionFloat`, `SinglePrecisionFloat`, `DoublePrecisionFloat` and `Decimal` — now carries `layout`, `read` and `write` at runtime, as a struct does, in the same little-endian encoding a struct field of that type uses. `allocate`, `createFixedBufferStorage` and `nativePointerTo` accept them directly, so `createFixedBufferStorage(SinglePrecisionFloat, 44_100)` replaces the struct of one field it used to take; `@fulcro/memory` also accepts an element type whose members are on a class, which is what `Decimal` is. `BigInteger` and `Fraction` have no fixed layout and are still refused.
