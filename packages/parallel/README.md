# @fulcro/parallel

A worker pool for work that is **not waiting on anything** — parsing, hashing,
compressing, transforming. Runs on the browser and on Node. No dependencies.

```sh
npm install @fulcro/parallel
```

```ts
import { createWorkerPool } from '@fulcro/parallel';
```

## Is this the tool you want?

Probably not, and that is worth settling before reading further.

| Your work                                | Reach for                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| Waiting on a network, a disk, a database | [`selectAwait`](../collections/README.md) — concurrency |
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

## Failures

A task that throws rejects the run with its message. The error's _message_
crosses, not the error object: a custom error class loses its prototype in a
structured clone, and the message is what a caller reads anyway.

A module that will not load, or an export that is not a function, rejects on the
first run rather than hanging.

## Browser and Node

One implementation, two thin adapters. Almost everything this needs is a web
standard Node adopted — `navigator.hardwareConcurrency`, structured clone,
`AbortSignal`, `new URL(…, import.meta.url)`. Only worker construction and
message reading differ, and the `exports` map picks between them, so a browser
bundle never contains a reference to `node:worker_threads`.

**This package is ESM only.** `import.meta.url` is what locates the worker
script portably, and it does not exist in CommonJS.

---

**Full guide:** [docs/parallelism.md](../../docs/parallelism.md) — scenarios,
worked examples and the failure modes worth knowing before you meet them.
