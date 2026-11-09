---
'@fulcro/memory': minor
'@fulcro/types': minor
---

A storage of structs can now hold its bytes one field at a time: pass `StructureOfArrays` as the last argument of `createFixedBufferStorage` or `allocate`, and walk one field with `asFieldView(storage, key)`. `ArrayOfStructures` names the layout every storage already had, and stays the default. A struct descriptor now carries the type of each field as `fields`.
