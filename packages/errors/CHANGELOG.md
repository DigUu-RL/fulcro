# @fulcro/errors

## 2.2.0

### Minor Changes

- 43e0876: Add structured tasks with cancellation, for work that waits rather than computes. `createTaskScope({ concurrency?, token? })` returns a `TaskScope` whose `spawn(work)` starts a `Task<T>` — awaitable for its value, with `settled` as a `Result` and `cancel()` for that task alone — and whose `join()` waits for every task. No task outlives its scope: `await using` calls off what is still running and waits for it. With `concurrency`, a task beyond the limit waits unstarted. The first task to fail calls the others off and `join` rejects with it; a failure nobody joined is thrown when the scope is disposed. `createCancellationSource(parent?)` returns the `CancellationSource` and `CancellationToken` behind it, whose `signal` is an ordinary `AbortSignal`. New codes: `FULCRO3011` for a spawn into an ended scope, `FULCRO3012` for a concurrency that is not a positive integer, `FULCRO3013` for a task that rejects with `null` or `undefined`. `@fulcro/parallel` now depends on `@fulcro/functions`.

## 2.1.0

### Minor Changes

- 3817176: Keep the worker pool's promises when something goes wrong. A closed pool now stays closed: a run started afterwards, or one still waiting for its turn when the pool closed, rejects with `FULCRO3010` instead of starting threads that nothing would close, and `close()` settles only once every worker is gone, including those a cancelled run is still stopping. A run still waiting for its turn rejects as soon as its signal aborts, and a `stream` stops its workers at the abort even while its consumer is busy with the last result. On Node, a worker that fails while no run is using it no longer ends the process with an uncaught exception, and the next run replaces it instead of waiting on a thread that is gone.

## 2.0.0

### Major Changes

- 8c40c25: Every error now carries `details`: the values its message was written from, by name and frozen, always with the `operation` that failed — `error.details.index` instead of reading the number back out of the message. Recognise one with `isFulcroError(error, 'FULCRO7002')`, which narrows `details` to that code's fields, or with `error instanceof FulcroError`; the built-in class (`RangeError`, `TypeError`) is unchanged, and `DetailsOf<'FULCRO7002'>` names one code's details. Messages and classes are unchanged. **Breaking, in `@fulcro/errors` only:** `createError(code, ...values)` is now `createError(code, details)`, so `createError('FULCRO6021', 'Vector3.from', 'x')` becomes `createError('FULCRO6021', { operation: 'Vector3.from', field: 'x' })`. `CodedError` remains as a deprecated name for `FulcroError`.

### Minor Changes

- d83a1ba: Add the access layer: `asView(source, start?, length?)` returns a `View<T>` over a region of a storage, another view or an array, and `asReadOnlyView` returns a `ReadOnlyView<T>`, which has no `set` in its type or at runtime. Neither copies or owns anything, and subviews nest without adding a step to each access. `pointerTo(source, index)` returns a `Pointer<T>` to one position, moved with `offset`, and `referenceTo(value)` returns a `MemoryReference<T>` to one value. A view over a storage from `allocate` refuses access once its memory is released. Their errors are `FULCRO7014`–`FULCRO7017`.
- 21d09a1: Add `Allocator`, so the caller chooses where memory comes from: `allocate(element, length, allocator)` returns a `Storage<T>` from any of them. Five strategies ship — `createManagedAllocator` (reclaimed by the garbage collector), `createArenaAllocator` (released all at once by `reset()` or a `using` scope), `createStackAllocator` (frames from `stack.enter()`, left last in first out), `createFixedBufferAllocator` (a buffer you supply) and `createPoolAllocator` (blocks of one size returned in any order) — and an allocator written outside the package works everywhere theirs do. Memory used after its allocator released it is refused rather than read. Their errors are `FULCRO7005`–`FULCRO7013`.
- 4eb7eae: Add linear memory and native pointers: `createLinearMemory(backing)` returns a `LinearMemory` over an `ArrayBuffer` or a `WebAssembly.Memory`, in which an address is a byte offset, and `nativePointerTo(memory, address, element)` returns a `NativePointer<T>` to the value at that address. `at(byteOffset, element?)` moves it by bytes and can read what is there as another type, which reaches a field of a struct in place. A pointer reads the current bytes on every access, so it keeps working after the memory grows. `nativePointerTo(allocation, element)` points at an allocation from any allocator, reaches only its bytes, and refuses access once its memory is released. Shared memory and misaligned addresses are refused. Their errors are `FULCRO7018`–`FULCRO7022`.
- 1dfec8b: Introduce `@fulcro/memory`: where a value's bytes live and who may reach them — storage, allocation and access to memory regions. Its errors carry codes from the new range `FULCRO7xxx`, which `@fulcro/errors` now reserves for it.
- 7e921ba: Add ownership: `own(create)` creates a storage and returns its `Owned<T>`, whose values are reached only by borrowing them. `borrow(owner)` lends them for reading as a `Borrowed<T>`, a `ReadOnlyView<T>` that any number of readers can hold at once; `borrowMutable(owner)` lends them for writing as a `MutableBorrow<T>`, a `View<T>` that ends every borrow before it. `move(owner)` hands the same values to a new owner and spends the old one. A spent owner, and a borrow something later ended — with every subview, view and pointer made from it — throw on their next access. The optional transformer at `@fulcro/memory/transformer` (or `@fulcro/memory/unplugin`) refuses the same uses when the code is compiled, following variables through branches, loops and closures; it rewrites nothing. `@fulcro/transform-core` is now a dependency, and `typescript` an optional peer. Their errors are `FULCRO7023`–`FULCRO7029`.
- d16fa12: Release what a scope holds when the scope ends, with TypeScript's own `using` and `await using`. An `Owned<T>` is now `Disposable`: leaving its `using` scope ends every borrow taken from it and spends the owner, which then refuses everything with `FULCRO7030`; an owner already moved from is left alone, so the owner `move` returned keeps its borrows. A `PoolAllocator`'s allocations are disposable on their own and return their block, a `FixedBufferAllocator` is an `AllocationDomain` that resets like an arena, and a `WorkerPool` is `AsyncDisposable`, closing its workers at the end of an `await using` scope. The text of `FULCRO7024` now names disposal among the ways a borrow ends.
- 1cd194e: Add `Storage<T>`, one contract for a fixed number of values held by index, with two strategies behind it: `createManagedStorage`, which holds any value as it is in an ordinary array, and `createFixedBufferStorage`, which holds the values of a struct from `@fulcro/types` as bytes, end to end in one buffer. Their errors are `FULCRO7001`–`FULCRO7004`.

## 1.1.0

### Minor Changes

- b9b4ce1: `@fulcro/types` gains the mathematics types: `Matrix`, `Vector`, `Fraction`,
  `ComplexNumber` and `Quaternion`, each declared over any numeric type of the
  package — or over one another — and doing its arithmetic through that type's
  descriptor. Dimensions are type parameters: `Matrix(SinglePrecisionFloat, 3, 4)`
  multiplies a vector of 4 rows, and a product whose shapes do not meet does not
  compile, with no plugin. When the element type has a layout, so does the type
  built on it, so it can be a struct's field and `sizeOf` reads it.

  `@fulcro/reflect` gains `constantOf(() => …)`: with the transformer, the
  function runs while the program compiles and the call is replaced by a frozen
  literal of its result; without it, the function runs at runtime with the same
  answer. A function the transformer cannot prove constant is a compile error at
  the call, never a silent fallback.

  `@fulcro/transform-core` lets a rewriter refuse a call as a compile error:
  through `ts-patch`'s `addDiagnostic` where it is available, and as
  `FULCRO5003` listing every refusal of a file otherwise. The transformer factory
  takes `ts-patch`'s extras as a third argument.

  `@fulcro/errors` registers `FULCRO4010`–`FULCRO4014`, `FULCRO5003` and
  `FULCRO6033`–`FULCRO6042`.

## 1.0.1

### Patch Changes

- e257819: `offsetOf<T>(field)` and `layoutOf<T>()` answer where a struct's fields sit, at
  compile time: `offsetOf<Vector3>('y')` becomes `4`, and `layoutOf<Vector3>()`
  becomes a frozen object equal to `Vector3.layout`. A name that is not a field is
  a type error. The layout of a struct value's type now also lists each field's
  size and alignment, in declaration order, which is what the transformer places
  the fields from — including for a struct imported from a built package.
  `FULCRO4009` names the two new utilities in its message.

## 1.0.0

### Major Changes

- c24bd4c: Every error now carries a stable `FULCRO` code, at the start of its message and
  as `error.code`: `TypeError: FULCRO6021: Vector3.from: missing field 'x'.` The
  class of each error is unchanged, so `instanceof` keeps working, but every
  message now starts with its code — code that compares a message as a whole, or
  anchors a pattern at its start, has to be updated. Match on `error.code`
  instead: the code keeps its meaning across releases, while the wording after it
  may improve.

  The codes live in the new `@fulcro/errors` package, which every other package
  depends on. What each one means, and what to write instead, is in
  `docs/errors.md`.

  `@fulcro/parallel`: an error thrown by a task inside a worker now rejects as
  `FULCRO3005` with the task's own message kept after the code; the library's own
  errors cross the worker boundary with their own code and class.
