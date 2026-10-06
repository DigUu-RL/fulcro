---
'@fulcro/memory': minor
'@fulcro/errors': minor
---

Add the access layer: `asView(source, start?, length?)` returns a `View<T>` over a region of a storage, another view or an array, and `asReadOnlyView` returns a `ReadOnlyView<T>`, which has no `set` in its type or at runtime. Neither copies or owns anything, and subviews nest without adding a step to each access. `pointerTo(source, index)` returns a `Pointer<T>` to one position, moved with `offset`, and `referenceTo(value)` returns a `MemoryReference<T>` to one value. A view over a storage from `allocate` refuses access once its memory is released. Their errors are `FULCRO7014`–`FULCRO7017`.
