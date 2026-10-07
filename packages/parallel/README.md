# @fulcro/parallel

Two tools, kept apart on purpose. A worker pool for work that is **not waiting
on anything** — parsing, hashing, compressing, transforming. And structured
tasks, with cancellation, for work that **waits**. Runs on the browser and on
Node.

```sh
npm install @fulcro/parallel
```

```ts
import { createWorkerPool } from '@fulcro/parallel';
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';
```

## Is this the tool you want?

Probably not, and that is worth settling before reading further.

| Your work                                | Reach for                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| Waiting on a network, a disk, a database | [`selectAwait`](../collections/README.md) — concurrency |
| Several waiting jobs as one unit         | [Structured tasks](#structured-tasks)                   |
| Burning CPU: parsing, hashing, resizing  | This                                                    |

Threads do **nothing** for work that waits — there was never any idle time to
fill, and you have added the cost of copying data between realms to something
that was never the bottleneck. Concurrency and parallelism are different tools
for different problems.

## The work is named, not captured

This is the API's one constraint, and it is not arbitrary:

```ts
// Cannot work, and no library can make it work.
pool.map(rows, (row) => expensiveParse(row));
```

A worker is a separate JavaScript realm. A function passed to one has to be
serialised, and **a closure's captured scope is not serialisable** —
`expensiveParse` and everything it refers to exist only in the calling realm.
Libraries that appear to accept this either stringify the function and lose its
scope in silence, or re-import your whole module and hope it has no side
effects.

So you name a module export instead, which is a thing that genuinely crosses:

```ts
// parse.js
export const parseRow = (row) => JSON.parse(row.payload);
```

```ts
const pool = createWorkerPool<Row, Parsed>({
	module: new URL('./parse.js', import.meta.url),
	export: 'parseRow',
});

const parsed = await pool.map(rows);

await pool.close();
```

`new URL(…, import.meta.url)` is also the form Vite, Rollup, webpack and esbuild
all recognise as a worker entry and rewrite to the emitted asset. A bare string
path works on Node and breaks the moment a browser build moves a file.

## Reading the results

```ts
// In input order, whatever order the workers finished in.
const results = await pool.map(items);

// As each one is done.
for await (const result of pool.stream(items)) use(result);
```

`stream` is a plain `AsyncIterable`, so it drops straight into the sequences
without this package depending on them:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const total = await AsyncSequenceCollection.from(pool.stream(rows))
	.where((row) => row.valid)
	.aggregate(0, (sum, row) => sum + row.size);
```

## Close what you open

```ts
await pool.close();
```

A pool holds threads, and threads keep a Node process alive. Workers start on
the **first run** rather than at construction, so a pool nobody uses costs
nothing — but one that has run and not been closed will hang your process on
exit.

A closed pool stays closed. A run started afterwards, or one still waiting for
its turn when you closed, rejects with
[`FULCRO3010`](../../docs/errors/FULCRO3xxx.md#fulcro3010) and starts no thread.

Or let the scope close it, however the scope is left:

```ts
await using pool = createWorkerPool<Row, Parsed>({
	module,
	export: 'parseRow',
});
```

## What crossing a thread costs

Every value is **structure-cloned** in both directions: a real copy,
proportional to size. That allows plain objects, arrays, typed arrays, `Map`,
`Set` and `Date`, and rules out functions, class instances with behaviour, and
anything holding a reference to the outside world.

An `ArrayBuffer` can be _transferred_ instead — ownership moves, nothing is
copied, and the sending side can no longer read it:

```ts
await pool.map(buffers, {
	transfer: (buffer) => [buffer as ArrayBuffer],
});
```

For large binary payloads that is the difference between worthwhile and not.

### There is a threshold, and below it this is slower

Starting threads is expensive, and copying data is expensive. Below some amount
of work per element, both cost more than the parallelism saves. The suite
asserts this in both directions rather than leaving you to find out — that four
workers beat one on genuinely heavy work, _and_ that a cold pool loses to a warm
one on trivial work.

Two practical consequences:

- **Reuse the pool.** Create it once, run many batches through it. Paying thread
  startup per batch is how a speed-up becomes a slowdown.
- **Measure.** If your elements are small and your function is quick, an
  ordinary loop will win.

## Workers

```ts
createWorkerPool({ module, export: 'parseRow', workers: 4 });
```

Defaults to `navigator.hardwareConcurrency` — a web standard both the browser
and Node report — and to `4` where neither does. More workers than cores does
not help work that is already CPU-bound; it only adds scheduling.

## Cancelling

```ts
const controller = new AbortController();

await pool.map(items, { signal: controller.signal });
```

Unlike a promise, a worker genuinely **can** be stopped — but only by being
terminated, not interrupted. So a worker holding an element when you abort is
killed, that element produces no result, and the pool discards itself rather
than handing the next run a thread still busy with something nobody is waiting
for. The next run builds a fresh one.

A run still waiting for its turn behind another rejects as soon as you abort,
and a `stream` stops its workers at the abort even while your loop is busy with
the last result.

## Failures

A task that throws rejects the run with its message. The error's _message_
crosses, not the error object: a custom error class loses its prototype in a
structured clone, and the message is what a caller reads anyway.

The first failure is the one you get, and it takes the rest of the run with it:
the elements still in flight are terminated with their workers, and the next run
starts a fresh set. A worker that dies between runs is replaced the same way.

A module that will not load, or an export that is not a function, rejects on the
first run rather than hanging.

## Structured tasks

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const url of urls) {
	scope.spawn((token) => fetch(url, { signal: token.signal }));
}

await scope.join();
```

No task outlives its scope: `await using` waits for every task when the block
ends, calling off the ones still running. With `concurrency`, a task beyond the
limit waits without starting anything. The first task to fail calls
the others off and `join` rejects with it; `task.cancel()` calls one task off
without failing the rest. A failure nobody joined is thrown when the scope
ends, never lost.

`createCancellationSource(parent?)` is the cancellation behind it: the source
calls work off, the token tells the work, and `token.signal` is an ordinary
`AbortSignal` for `fetch`, timers and `pool.map`. Tasks run on the calling
thread, so they overlap waiting and never computing — that is what the pool is
for.

The types a signature needs — `TaskScope`, `TaskScopeOptions`, `Task<T>`,
`TaskWork<T>`, `CancellationSource`, `CancellationToken` — are exported for
annotating your own code. See [docs/tasks.md](../../docs/tasks.md).

## Browser and Node

One implementation, two thin adapters. Almost everything this needs is a web
standard Node adopted — `navigator.hardwareConcurrency`, structured clone,
`AbortSignal`, `new URL(…, import.meta.url)`. Only worker construction and
message reading differ, and the `exports` map picks between them, so a browser
bundle never contains a reference to `node:worker_threads`.

**This package is ESM only.** `import.meta.url` is what locates the worker
script portably, and it does not exist in CommonJS.

---

**Full guides:** [docs/parallelism.md](../../docs/parallelism.md) and
[docs/tasks.md](../../docs/tasks.md) — scenarios, worked examples and the
failure modes worth knowing before you meet them.
