---
'@fulcro/memory': minor
'@fulcro/errors': minor
---

Add `Allocator`, so the caller chooses where memory comes from: `allocate(element, length, allocator)` returns a `Storage<T>` from any of them. Five strategies ship — `createManagedAllocator` (reclaimed by the garbage collector), `createArenaAllocator` (released all at once by `reset()` or a `using` scope), `createStackAllocator` (frames from `stack.enter()`, left last in first out), `createFixedBufferAllocator` (a buffer you supply) and `createPoolAllocator` (blocks of one size returned in any order) — and an allocator written outside the package works everywhere theirs do. Memory used after its allocator released it is refused rather than read. Their errors are `FULCRO7005`–`FULCRO7013`.
