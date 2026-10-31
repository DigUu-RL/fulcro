# @fulcro/memory

## 1.1.0

### Minor Changes

- b15f6af: Store a numeric type as bytes on its own. Every numeric type with a fixed layout — `SignedInteger(n)`, `UnsignedInteger(n)`, `HalfPrecisionFloat`, `SinglePrecisionFloat`, `DoublePrecisionFloat` and `Decimal` — now carries `layout`, `read` and `write` at runtime, as a struct does, in the same little-endian encoding a struct field of that type uses. `allocate`, `createFixedBufferStorage` and `nativePointerTo` accept them directly, so `createFixedBufferStorage(SinglePrecisionFloat, 44_100)` replaces the struct of one field it used to take; `@fulcro/memory` also accepts an element type whose members are on a class, which is what `Decimal` is. `BigInteger` and `Fraction` have no fixed layout and are still refused.

## 1.0.0

### Major Changes

- 3b1d05f: Ship every package as an ES module only, built by tsdown, and require Node 22.12 or later.

  What breaks:

  - **No CommonJS build**, where `@fulcro/parallel` already had none. `require('@fulcro/…')` on Node older than 22.12 fails. On 22.12 and later it still works, through Node's `require` of an ES module, so a compiler plugin loader that calls `require` keeps loading `./transformer`.
  - **A CommonJS TypeScript project compiled with `module: node16`** gets TS1479 on every `@fulcro/…` import, as it already did on `@fulcro/parallel`'s, since that setting does not let a CommonJS file `require` an ES module. Under `module: nodenext` the same imports compile, and so they do under `moduleResolution: node10`.
  - **`engines` is `>=22.12`** (was `>=22`).
  - **`./unplugin` ships `.js` and `.d.ts`** (was `.mjs` and `.d.mts`). The subpath is the same, so an import through it is unaffected; a path that reached into `dist` directly has to follow.

  What improves: the declarations ship with declaration maps and the TypeScript sources they point at, without the suites, so Go to Definition in an editor lands in the source rather than in a `.d.ts`. And the `./unplugin` adapters of `@fulcro/collections`, `@fulcro/reflect` and `@fulcro/memory` are now declared with `TransformerUnplugin` from `@fulcro/transform-core`. Their declarations used to name `WebpackPluginInstance`, `RspackPluginInstance`, `EsbuildPlugin` and `JsPlugin` without importing them, so an editor showed those adapters as `any`.

- 302c11d: The members of `Storage`, `View`, `ReadOnlyView`, `Pointer`, `MemoryReference`, `NativePointer`, `Allocator`, `Allocation`, `Owned` and the allocators, and the `read`, `write` and `is` of the element type `allocate` and `nativePointerTo` take, are now declared as readonly function properties (`get: (index: number) => T`) rather than as methods (`get(index: number): T`).

  They always were functions that work off their object, and destructuring them (`const { get, set } = storage`) is supported. The types now say so.

  What breaks: method parameters are compared both ways, property parameters only one way. A `Storage<number>` is therefore no longer assignable to `Storage<unknown>`, which it never safely was, since a `Storage<unknown>` may be handed a string to `set`. Code that held a storage, pointer or element of any type as `X<unknown>` should take it generically (`<T>(storage: Storage<T>)`), or ask only for the members it reads, in a type of its own such as `{ readonly name: string; readonly layout: { readonly size: number } }`. An object implementing these interfaces with method syntax still satisfies them.

- f72897a: Require TypeScript 5.9 or later for the transformers: the optional `typescript` peer is now `>=5.9 <7` (was `>=5.3.3 <7`).

  The transformers tell a type-only import apart through the compiler's `phaseModifier`, which replaced the deprecated `isTypeOnly` and first appears in 5.9. The runtime halves of these packages need no compiler, but npm checks the peer range on install all the same, observed with npm 11:

  - a project whose `typescript` range admits 5.9, such as `^5.8.3`, has its installed compiler moved up to the newest 5.x by the install, without being asked;
  - a project pinned below 5.9, such as `"typescript": "5.8.3"`, is refused with `ERESOLVE`. With `--legacy-peer-deps` the install goes through, the compiler stays where it was, and the runtime halves work; the transformers need 5.9.

### Patch Changes

- Updated dependencies [3b1d05f]
- Updated dependencies [f72897a]
- Updated dependencies [4416d08]
- Updated dependencies [f72897a]
  - @fulcro/errors@3.0.0
  - @fulcro/transform-core@2.0.0

## 0.1.0

### Minor Changes

- d83a1ba: Add the access layer: `asView(source, start?, length?)` returns a `View<T>` over a region of a storage, another view or an array, and `asReadOnlyView` returns a `ReadOnlyView<T>`, which has no `set` in its type or at runtime. Neither copies or owns anything, and subviews nest without adding a step to each access. `pointerTo(source, index)` returns a `Pointer<T>` to one position, moved with `offset`, and `referenceTo(value)` returns a `MemoryReference<T>` to one value. A view over a storage from `allocate` refuses access once its memory is released. Their errors are `FULCRO7014`–`FULCRO7017`.
- 21d09a1: Add `Allocator`, so the caller chooses where memory comes from: `allocate(element, length, allocator)` returns a `Storage<T>` from any of them. Five strategies ship — `createManagedAllocator` (reclaimed by the garbage collector), `createArenaAllocator` (released all at once by `reset()` or a `using` scope), `createStackAllocator` (frames from `stack.enter()`, left last in first out), `createFixedBufferAllocator` (a buffer you supply) and `createPoolAllocator` (blocks of one size returned in any order) — and an allocator written outside the package works everywhere theirs do. Memory used after its allocator released it is refused rather than read. Their errors are `FULCRO7005`–`FULCRO7013`.
- 4eb7eae: Add linear memory and native pointers: `createLinearMemory(backing)` returns a `LinearMemory` over an `ArrayBuffer` or a `WebAssembly.Memory`, in which an address is a byte offset, and `nativePointerTo(memory, address, element)` returns a `NativePointer<T>` to the value at that address. `at(byteOffset, element?)` moves it by bytes and can read what is there as another type, which reaches a field of a struct in place. A pointer reads the current bytes on every access, so it keeps working after the memory grows. `nativePointerTo(allocation, element)` points at an allocation from any allocator, reaches only its bytes, and refuses access once its memory is released. Shared memory and misaligned addresses are refused. Their errors are `FULCRO7018`–`FULCRO7022`.
- 1dfec8b: Introduce `@fulcro/memory`: where a value's bytes live and who may reach them — storage, allocation and access to memory regions. Its errors carry codes from the new range `FULCRO7xxx`, which `@fulcro/errors` now reserves for it.
- 7e921ba: Add ownership: `own(create)` creates a storage and returns its `Owned<T>`, whose values are reached only by borrowing them. `borrow(owner)` lends them for reading as a `Borrowed<T>`, a `ReadOnlyView<T>` that any number of readers can hold at once; `borrowMutable(owner)` lends them for writing as a `MutableBorrow<T>`, a `View<T>` that ends every borrow before it. `move(owner)` hands the same values to a new owner and spends the old one. A spent owner, and a borrow something later ended — with every subview, view and pointer made from it — throw on their next access. The optional transformer at `@fulcro/memory/transformer` (or `@fulcro/memory/unplugin`) refuses the same uses when the code is compiled, following variables through branches, loops and closures; it rewrites nothing. `@fulcro/transform-core` is now a dependency, and `typescript` an optional peer. Their errors are `FULCRO7023`–`FULCRO7029`.
- d16fa12: Release what a scope holds when the scope ends, with TypeScript's own `using` and `await using`. An `Owned<T>` is now `Disposable`: leaving its `using` scope ends every borrow taken from it and spends the owner, which then refuses everything with `FULCRO7030`; an owner already moved from is left alone, so the owner `move` returned keeps its borrows. A `PoolAllocator`'s allocations are disposable on their own and return their block, a `FixedBufferAllocator` is an `AllocationDomain` that resets like an arena, and a `WorkerPool` is `AsyncDisposable`, closing its workers at the end of an `await using` scope. The text of `FULCRO7024` now names disposal among the ways a borrow ends.
- 1cd194e: Add `Storage<T>`, one contract for a fixed number of values held by index, with two strategies behind it: `createManagedStorage`, which holds any value as it is in an ordinary array, and `createFixedBufferStorage`, which holds the values of a struct from `@fulcro/types` as bytes, end to end in one buffer. Their errors are `FULCRO7001`–`FULCRO7004`.
- 8c40c25: Every error now carries `details`: the values its message was written from, by name and frozen, always with the `operation` that failed — `error.details.index` instead of reading the number back out of the message. Recognise one with `isFulcroError(error, 'FULCRO7002')`, which narrows `details` to that code's fields, or with `error instanceof FulcroError`; the built-in class (`RangeError`, `TypeError`) is unchanged, and `DetailsOf<'FULCRO7002'>` names one code's details. Messages and classes are unchanged. **Breaking, in `@fulcro/errors` only:** `createError(code, ...values)` is now `createError(code, details)`, so `createError('FULCRO6021', 'Vector3.from', 'x')` becomes `createError('FULCRO6021', { operation: 'Vector3.from', field: 'x' })`. `CodedError` remains as a deprecated name for `FulcroError`.

### Patch Changes

- Updated dependencies [d83a1ba]
- Updated dependencies [21d09a1]
- Updated dependencies [4eb7eae]
- Updated dependencies [1dfec8b]
- Updated dependencies [7e921ba]
- Updated dependencies [d16fa12]
- Updated dependencies [1cd194e]
- Updated dependencies [8c40c25]
- Updated dependencies [1fc85fa]
  - @fulcro/errors@2.0.0
  - @fulcro/transform-core@1.3.0
