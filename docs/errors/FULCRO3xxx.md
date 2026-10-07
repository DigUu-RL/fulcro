# FULCRO3xxx — `@fulcro/parallel`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO3xxx.md)

The errors of the [worker pool](../parallelism.md) and of
[structured tasks](../tasks.md). Back to [all codes](../errors.md).

A worker is a separate thread, and only text crosses back from it. Where an
error started in a worker, the pool creates it again on your side: the
library's own errors come back with their own code, and anything else keeps its
text under a code that says where it happened.

## FULCRO3001

```text
Error: FULCRO3001: file:///app/work.mjs has no callable export named "resize".
```

Details:

```text
{ operation: string; module: string; name: string }
```

The module the pool was given loads, but the `export` it names is missing or is
not a function. Every worker refuses to start, so the first `map()` rejects.

Check the spelling of `export`, and that the module exports the function by
that name rather than as its default.

## FULCRO3002

```text
Error: FULCRO3002: This module is only meaningful inside a worker.
```

Details:

```text
{ operation: string }
```

The script the workers run, `@fulcro/parallel/worker`, was imported somewhere
that is not a worker. Nothing needs to import it: the pool starts it itself.

## FULCRO3003

```text
Error: FULCRO3003: A pool needs a positive integer worker count, and was given 0.
```

Details:

```text
{ operation: string; workers: number | undefined }
```

`createWorkerPool()` was given a `workers` option that is not a whole number of
at least one. Leave it out to use the machine's core count.

## FULCRO3004

```text
Error: FULCRO3004: <the text of the failure>
```

Details:

```text
{ operation: string; reason: string }
```

A worker could not load the task module: the module was not found, or it threw
while it was being evaluated. The message is the text of that failure, word for
word, after the code.

Check the `module` URL — it is resolved inside the worker, so a relative path
is resolved against the worker script, not against your file. Build it with
`new URL('./work.mjs', import.meta.url)`.

## FULCRO3005

```text
Error: FULCRO3005: <the text your task threw>
```

Details:

```text
{ operation: string; reason: string }
```

The task threw, or rejected, while it was working on an element. The message is
your task's own message, word for word, after the code; the run rejects with it
and hands out no further elements.

Only the text survives the thread boundary. To tell your own failures apart,
put what you need in the message the task throws.

## FULCRO3006

```text
Error: FULCRO3006: The worker was given a task before it was initialised.
```

Details:

```text
{ operation: string }
```

A worker received an element before it had loaded the task module. The pool
never does this; seeing it means the protocol between the pool and its workers
was broken, which is a defect in the library worth reporting.

## FULCRO3007

```text
Error: FULCRO3007: The worker exited with code 1.
```

Details:

```text
{ operation: string; exitCode: number }
```

A worker thread on Node stopped with a non-zero exit code while the pool was
still waiting on it — it was terminated, or its process ran out of memory. A
run whose workers are closed underneath it rejects with this rather than
waiting forever.

## FULCRO3008

```text
Error: FULCRO3008: <the text of the failure>
```

Details:

```text
{ operation: string; reason: string }
```

A worker in the browser raised an error that nothing inside it caught — most
often its script, or the task module, failing to load. The message is the one
the browser reported.

## FULCRO3009

```text
Error: FULCRO3009: A message could not be cloned across the worker boundary.
```

Details:

```text
{ operation: string }
```

An element or a result could not be copied to or from a worker. Only what the
structured clone algorithm accepts can cross: plain data, arrays, maps, typed
arrays — not functions, class instances with methods, or DOM nodes.

Send plain data, and rebuild richer objects on the other side.

## FULCRO3010

```text
Error: FULCRO3010: The pool was closed, and a closed pool runs nothing.
```

Details:

```text
{ operation: string }
```

`map()` or `stream()` was called on a pool after `close()`, or was still waiting
for its turn behind another run when the pool closed. `operation` says which of
the two. A closed pool stays closed and starts no thread for the run.

Create a new pool if there is more work, or close the pool only once nothing
else will be handed to it — at shutdown, or at the end of an `await using`
scope.

## FULCRO3011

```text
Error: FULCRO3011: The task scope has ended, and an ended scope starts nothing.
```

Details:

```text
{ operation: string }
```

`spawn()` was called on a [task scope](../tasks.md) after `join()` had finished
or after the scope was disposed. A scope that has ended waits for nothing, so a
task started in it would outlive it — which is the one thing a scope exists to
prevent.

Spawn every task before the scope ends: from the code that owns the scope, or
from a task still running in it — `join` waits for those too. Create a new
scope for work that comes later.

## FULCRO3012

```text
RangeError: FULCRO3012: A task scope needs a positive integer concurrency, or Infinity, and was given 0.
```

Details:

```text
{ operation: string, concurrency: number }
```

`createTaskScope({ concurrency })` was given a limit that is not a whole number
of at least one: zero, a negative number, a fraction or `NaN`. `concurrency`
is the value given.

Pass how many tasks may run at once, or leave `concurrency` out for no limit.

## FULCRO3013

```text
Error: FULCRO3013: The task rejected with undefined, which cannot be told apart from no failure.
```

Details:

```text
{ operation: string, thrown: null | undefined }
```

The work handed to `spawn()` in a [task scope](../tasks.md) rejected, or
threw, `null` or `undefined`. A failure that is nothing cannot be held as one,
and as the reason for calling the other tasks off it would become an unrelated
`AbortError`. This error stands in for it, the same object everywhere the
failure is reported. `thrown` is the value, also kept as `cause`.

Reject with an `Error` that says what went wrong.
