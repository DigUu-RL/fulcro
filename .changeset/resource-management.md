---
'@fulcro/memory': minor
'@fulcro/parallel': minor
'@fulcro/errors': minor
---

Release what a scope holds when the scope ends, with TypeScript's own `using` and `await using`. An `Owned<T>` is now `Disposable`: leaving its `using` scope ends every borrow taken from it and spends the owner, which then refuses everything with `FULCRO7030`; an owner already moved from is left alone, so the owner `move` returned keeps its borrows. A `PoolAllocator`'s allocations are disposable on their own and return their block, a `FixedBufferAllocator` is an `AllocationDomain` that resets like an arena, and a `WorkerPool` is `AsyncDisposable`, closing its workers at the end of an `await using` scope. The text of `FULCRO7024` now names disposal among the ways a borrow ends.
