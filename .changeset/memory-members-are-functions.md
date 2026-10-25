---
'@fulcro/memory': major
---

The members of `Storage`, `View`, `ReadOnlyView`, `Pointer`, `MemoryReference`, `NativePointer`, `AlignedElement`, `Allocator`, `Allocation`, `Owned` and the allocators are now declared as readonly function properties (`get: (index: number) => T`) rather than as methods (`get(index: number): T`).

They always were functions that work off their object, and destructuring them (`const { get, set } = storage`) is supported. The types now say so.

What breaks: method parameters are compared both ways, property parameters only one way. A `Storage<number>` is therefore no longer assignable to `Storage<unknown>`, which it never safely was, since a `Storage<unknown>` may be handed a string to `set`. Code that held a storage, pointer or element of any type as `X<unknown>` should take it generically (`<T>(storage: Storage<T>)`), or ask only for the members it reads, as `Pick<AlignedElement<unknown>, 'name' | 'layout'>`. An object implementing these interfaces with method syntax still satisfies them.
