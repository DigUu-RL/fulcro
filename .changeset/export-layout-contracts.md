---
'@fulcro/types': minor
---

Export `FloatType` and `FixedLayoutType`. The float descriptors are declared as `FloatType<T>`, which the package did not export, so a project emitting declarations failed with TS2742 on `export const Half = HalfPrecisionFloat`, and on any struct with a float field; it now compiles. `FixedLayoutType<T>` — `layout`, `read` and `write` — is the contract every numeric type with a fixed layout satisfies, for code that stores any of them. `Decimal.read` and `Decimal.write` are now `readonly`, as `Decimal.layout` already was, so the storage path and the struct path cannot be made to write differently.
