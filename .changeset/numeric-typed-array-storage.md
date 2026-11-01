---
'@fulcro/types': minor
'@fulcro/memory': minor
---

Hold numeric values in a typed array. Every numeric type with a fixed layout now names the encoding of its bytes as `layout.encoding` — `'Int32'`, `'BigUint64'`, `'Float64'`, and `'Int128'`, `'Uint128'`, `'Float16'` and `'Decimal128'` on the same pattern — and `allocate` and `createFixedBufferStorage` read it: when the language has a typed array of that name, the storage holds its values in one over the same bytes, chosen once when the storage is made, so `get` and `set` call neither the type's `read` and `write` nor a `DataView` accessor. Values, bytes and errors are the same either way. The integers up to 64 bits, `SinglePrecisionFloat` and `DoublePrecisionFloat` are held this way; `HalfPrecisionFloat`, the 128-bit integers, `Decimal`, structs, misaligned bytes and big-endian platforms are read through the type as before. An element type written outside the package may name an encoding in its `layout` too.
