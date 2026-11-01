---
'@fulcro/memory': minor
'@fulcro/transform-core': minor
---

Allocate from a frame what cannot outlive its block. `createManagedAllocator()` now returns a `ManagedAllocator`: an `Allocator` with `enter()`, which opens a frame whose allocations are released when its `using` scope ends and whose bytes the next frame reuses. A managed frame never refuses a request — what does not fit the reused memory gets a buffer of its own — and frames may be left in any order; a frame already left refuses to allocate, with `FULCRO7012`. The memory transformer uses it: `const storage = allocate(element, length, managed)`, where `managed` is a `const` holding `createManagedAllocator()` and `storage` is only used through `get`, `set` and `length` inside a block of a synchronous function, is compiled as an allocation from `managed.enter()`, so a loop that made a buffer per round makes two in all. Every other storage stays where it was written, and without the transformer every storage does. `@fulcro/transform-core` gains `StatementRewriter`, taken as an optional last parameter by `createTransformer`, `createFileTransformer` and `createTransformerUnplugin`.
