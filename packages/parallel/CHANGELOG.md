# @fulcro/parallel

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
