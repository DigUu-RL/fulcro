# FULCRO3xxx — `@fulcro/parallel`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO3xxx.md)

The errors of the [worker pool](../parallelism.md). Back to
[all codes](../errors.md).

A worker is a separate thread, and only text crosses back from it. Where an
error started in a worker, the pool creates it again on your side: the
library's own errors come back with their own code, and anything else keeps its
text under a code that says where it happened.

## FULCRO3001

```text
Error: FULCRO3001: file:///app/work.mjs has no callable export named "resize".
```

The module the pool was given loads, but the `export` it names is missing or is
not a function. Every worker refuses to start, so the first `map()` rejects.

Check the spelling of `export`, and that the module exports the function by
that name rather than as its default.

## FULCRO3002

```text
Error: FULCRO3002: This module is only meaningful inside a worker.
```

The script the workers run, `@fulcro/parallel/worker`, was imported somewhere
that is not a worker. Nothing needs to import it: the pool starts it itself.

## FULCRO3003

```text
Error: FULCRO3003: A pool needs a positive integer worker count, and was given 0.
```

`createWorkerPool()` was given a `workers` option that is not a whole number of
at least one. Leave it out to use the machine's core count.

## FULCRO3004

```text
Error: FULCRO3004: <the text of the failure>
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

The task threw, or rejected, while it was working on an element. The message is
your task's own message, word for word, after the code; the run rejects with it
and hands out no further elements.

Only the text survives the thread boundary. To tell your own failures apart,
put what you need in the message the task throws.

## FULCRO3006

```text
Error: FULCRO3006: The worker was given a task before it was initialised.
```

A worker received an element before it had loaded the task module. The pool
never does this; seeing it means the protocol between the pool and its workers
was broken, which is a defect in the library worth reporting.

## FULCRO3007

```text
Error: FULCRO3007: The worker exited with code 1.
```

A worker thread on Node stopped with a non-zero exit code while the pool was
still waiting on it — it was terminated, or its process ran out of memory. A
run whose workers are closed underneath it rejects with this rather than
waiting forever.

## FULCRO3008

```text
Error: FULCRO3008: <the text of the failure>
```

A worker in the browser raised an error that nothing inside it caught — most
often its script, or the task module, failing to load. The message is the one
the browser reported.

## FULCRO3009

```text
Error: FULCRO3009: A message could not be cloned across the worker boundary.
```

An element or a result could not be copied to or from a worker. Only what the
structured clone algorithm accepts can cross: plain data, arrays, maps, typed
arrays — not functions, class instances with methods, or DOM nodes.

Send plain data, and rebuild richer objects on the other side.
