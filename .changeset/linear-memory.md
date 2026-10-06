---
'@fulcro/memory': minor
'@fulcro/errors': minor
---

Add linear memory and native pointers: `createLinearMemory(backing)` returns a `LinearMemory` over an `ArrayBuffer` or a `WebAssembly.Memory`, in which an address is a byte offset, and `nativePointerTo(memory, address, element)` returns a `NativePointer<T>` to the value at that address. `at(byteOffset, element?)` moves it by bytes and can read what is there as another type, which reaches a field of a struct in place. A pointer reads the current bytes on every access, so it keeps working after the memory grows. `nativePointerTo(allocation, element)` points at an allocation from any allocator, reaches only its bytes, and refuses access once its memory is released. Shared memory and misaligned addresses are refused. Their errors are `FULCRO7018`–`FULCRO7022`.
