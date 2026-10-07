# @fulcro/parallel

## 1.3.0

### Minor Changes

- 43e0876: Add structured tasks with cancellation, for work that waits rather than computes. `createTaskScope({ concurrency?, token? })` returns a `TaskScope` whose `spawn(work)` starts a `Task<T>` — awaitable for its value, with `settled` as a `Result` and `cancel()` for that task alone — and whose `join()` waits for every task. No task outlives its scope: `await using` calls off what is still running and waits for it. With `concurrency`, a task beyond the limit waits unstarted. The first task to fail calls the others off and `join` rejects with it; a failure nobody joined is thrown when the scope is disposed. `createCancellationSource(parent?)` returns the `CancellationSource` and `CancellationToken` behind it, whose `signal` is an ordinary `AbortSignal`. New codes: `FULCRO3011` for a spawn into an ended scope, `FULCRO3012` for a concurrency that is not a positive integer, `FULCRO3013` for a task that rejects with `null` or `undefined`. `@fulcro/parallel` now depends on `@fulcro/functions`.

### Patch Changes

- Updated dependencies [43e0876]
  - @fulcro/errors@2.2.0

## 1.2.0

### Minor Changes

- 3817176: Keep the worker pool's promises when something goes wrong. A closed pool now stays closed: a run started afterwards, or one still waiting for its turn when the pool closed, rejects with `FULCRO3010` instead of starting threads that nothing would close, and `close()` settles only once every worker is gone, including those a cancelled run is still stopping. A run still waiting for its turn rejects as soon as its signal aborts, and a `stream` stops its workers at the abort even while its consumer is busy with the last result. On Node, a worker that fails while no run is using it no longer ends the process with an uncaught exception, and the next run replaces it instead of waiting on a thread that is gone.

### Patch Changes

- Updated dependencies [3817176]
  - @fulcro/errors@2.1.0

## 1.1.0

### Minor Changes

- d16fa12: Release what a scope holds when the scope ends, with TypeScript's own `using` and `await using`. An `Owned<T>` is now `Disposable`: leaving its `using` scope ends every borrow taken from it and spends the owner, which then refuses everything with `FULCRO7030`; an owner already moved from is left alone, so the owner `move` returned keeps its borrows. A `PoolAllocator`'s allocations are disposable on their own and return their block, a `FixedBufferAllocator` is an `AllocationDomain` that resets like an arena, and a `WorkerPool` is `AsyncDisposable`, closing its workers at the end of an `await using` scope. The text of `FULCRO7024` now names disposal among the ways a borrow ends.
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
  - @fulcro/errors@2.0.0

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

### Patch Changes

- Updated dependencies [c24bd4c]
  - @fulcro/errors@1.0.0

## 0.1.1

### Patch Changes

- ee1e905: Keep the worker pool's promises under overlapping runs, cancellation and a
  failed start.

  Two runs on one pool used to share the workers, and replies carry the element's
  position — which every run counts from zero — so each run read the other's
  results and released workers that were still busy. Runs are now serialised: a
  second `map` or `stream` waits for the one in progress, and a `stream`
  therefore holds the pool until it is finished or abandoned.

  A run also used to leave its message handlers registered, so a pool reused
  across batches — which the documentation recommends — accumulated one set per
  batch and tripped Node's listener warning on the eleventh. Handlers are now
  removed when the run that registered them ends.

  An abort is not a reply, so a run whose workers were all busy only noticed it
  had been called off once one of them finished on its own. The signal now wakes
  the run directly, and a run aborted before it starts hands out nothing at all.

  Finally, a worker that failed to load left the workers that had already started
  running, and a `close()` arriving during that handshake found nothing to stop.
  Both now terminate what was spawned.

## 0.1.0

### Minor Changes

- 4b7ea33: First release.

  A worker pool for work that is not waiting on anything — parsing, hashing,
  compressing, transforming — on the browser and on Node from one implementation
  rather than two.

  The work is named rather than captured, and that is the API's one constraint. A
  worker is a separate realm, and a closure's captured scope is not serialisable,
  so a function cannot cross into one; libraries that appear to accept a closure
  either stringify it and lose that scope silently, or re-import the calling
  module and hope it has no side effects. Naming a module export instead is a
  thing that genuinely crosses — and `new URL(…, import.meta.url)` is also the
  form every major bundler recognises as a worker entry.

  `map` returns results in input order; `stream` yields them as they finish and is
  a plain `AsyncIterable`, so it feeds `AsyncSequenceCollection.from` without this
  package depending on the sequences.

  Workers start on the first run rather than at construction, so a pool nobody
  uses costs no threads — and a pool that has run must be closed, since threads
  keep a Node process alive.

  The suite asserts the unflattering half too: that four workers beat one on
  genuinely heavy work, and that a cold pool loses to a warm one on trivial work.
  Below some amount of work per element, threads cost more than they save, and
  saying so is more use than a benchmark that only shows the good case.
