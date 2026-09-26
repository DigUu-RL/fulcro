# Bounded concurrency

Running several elements at once instead of one at a time — for work that spends
its time waiting.

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Part of [async sequences](./async-sequences.md); read that first if you have not.

## The problem it solves

This loads a hundred users one after another. If each request takes 100 ms, it
takes ten seconds:

```ts
const users = await AsyncSequenceCollection.from(ids)
	.select(loadUser)
	.toArray();
```

This loads eight at a time, and takes a little over one second:

```ts
const users = await AsyncSequenceCollection.from(ids)
	.selectAwait(loadUser, { concurrency: 8 })
	.toArray();
```

Nothing runs _at the same instant_ — JavaScript is one thread. What overlaps is
the **waiting**. While one request is in the air, the others can be too.

**This does nothing for work that is not waiting.** Parsing, hashing, resizing —
anything CPU-bound — gets no faster, because there was never any idle time to
fill. That needs real parallelism, which is a different tool.

## The three operators

```ts
// Project several at a time.
.selectAwait(loadUser, { concurrency: 8 })

// Filter with a condition that has to ask something.
.whereAwait(async (id) => hasPermission(id), { concurrency: 8 })

// Do something for its effects, with no result collected.
await rows.forEachAwait((row) => database.insert(row), { concurrency: 4 });
```

The `Await` suffix is the marker: `select` awaits one element before pulling the
next, `selectAwait` keeps several in flight. Operators without it need no
decision from you, and that is the point of keeping them separate.

## `concurrency` is required, and that is deliberate

There is no default, and the type will not let you omit it:

```ts
.selectAwait(loadUser, { concurrency: 8 }) // ✓
.selectAwait(loadUser)                     // ✗ does not compile
```

No default could be right:

- **Unbounded** is how rate limits get hit and file descriptors run out — and it
  works fine in development, where the input is small, then fails in production.
- **`1`** would make the operator pointless.
- **Anything in between** is a guess about a service only you know.

A limit that is not a positive integer is rejected **where you wrote it**, not
later when the sequence runs:

```ts
.selectAwait(loadUser, { concurrency: 0 })
// Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

### Picking a number

There is no universal answer, but there are useful anchors:

| Work                              | Reasonable starting point                      |
| --------------------------------- | ---------------------------------------------- |
| An API you do not control         | Whatever its rate limit allows, minus headroom |
| An API you do control             | 10–50                                          |
| A database with a connection pool | At most the pool size                          |
| Reading many files                | 10–100                                         |

If the thing you are calling has a documented limit, that is your ceiling. If it
does not, start low and raise it while watching for errors.

## Order

Results come back **in input order by default**:

```ts
const results = await AsyncSequenceCollection.from([1, 2, 3])
	.selectAwait(slowFor, { concurrency: 3 })
	.toArray();
// [1, 2, 3] — whatever order they finished in
```

That is the behaviour that composes: an operator in the middle of a chain should
not quietly change what a later `zip` or `pairwise` is pairing. A slow element
holds back the ones behind it, though they still _ran_ concurrently — the
waiting is overlapped either way.

Ask for completion order when you want each result as soon as it exists:

```ts
.selectAwait(loadUser, { concurrency: 8, ordered: false })
```

Useful when you are rendering results as they arrive, or writing them somewhere
that does not care about order. Not useful when the position carries meaning.

## When something fails

The sequence rejects with the first error, and:

1. **No further work is started.**
2. **Work already in flight is awaited** before the rejection reaches you.

That second point is not politeness — it is what stops a rejection from a task
nobody is waiting on any more from surfacing later as an unhandled rejection and
crashing the process.

```ts
try {
	await ids.selectAwait(loadUser, { concurrency: 8 }).toArray();
} catch (error) {
	// The first failure. Anything else in flight has finished and been discarded.
}
```

### Collecting failures instead of stopping

There is no `settled: true` flag, because you can already express it — and the
composition reads better than a flag would:

```ts
import { tryCatch } from '@fulcro/functions';
import { SequenceCollection } from '@fulcro/collections';

const outcomes = await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => tryCatch(() => loadUser(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

Every element is attempted, nothing stops early, and you get both halves.

## Cancelling

The signal goes on the terminal, as it does everywhere else:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(ids)
	.selectAwait(loadUser, { concurrency: 8 })
	.toArray({ signal: controller.signal });
```

Aborting stops new work and rejects. It does **not** kill the eight requests
already in the air — a promise has no cancel. To stop those too, hand the same
signal to the work itself:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => fetch(`/users/${id}`, { signal: controller.signal }), {
		concurrency: 8,
	})
	.toArray({ signal: controller.signal });
```

## What you give up

The rest of `AsyncSequence` has **back pressure**: one element is pulled,
processed, and only then is the next asked for. The concurrent operators
deliberately break that — up to `concurrency` elements are pulled before any
result comes back.

That is the trade. It is the right one when the elements are cheap and the work
on them is slow, which is the case these operators exist for. It is the wrong
one if pulling the elements is itself expensive or the source must not run
ahead.

## Real scenarios

### Enriching a list from an API

```ts
const enriched = await AsyncSequenceCollection.from(orders)
	.selectAwait(
		async (order) => ({ ...order, customer: await loadCustomer(order.id) }),
		{ concurrency: 10 },
	)
	.toArray();
```

### Writing batches, several at a time

```ts
await AsyncSequenceCollection.from(streamRows())
	.chunk(500)
	.forEachAwait((batch) => database.insertMany(batch), { concurrency: 4 });
```

Four inserts of five hundred rows in flight, and the stream never gets more than
four batches ahead.

### Checking permissions before acting

```ts
const allowed = await AsyncSequenceCollection.from(documents)
	.whereAwait((document) => canRead(user, document), { concurrency: 20 })
	.toArray();
```

### Rendering results as they arrive

```ts
const results = AsyncSequenceCollection.from(queries).selectAwait(search, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);
```

## Reference

| Operator                         | Returns            | Options                            |
| -------------------------------- | ------------------ | ---------------------------------- |
| `selectAwait(selector, options)` | `AsyncSequence<R>` | `concurrency`, `ordered`           |
| `whereAwait(predicate, options)` | `AsyncSequence<T>` | `concurrency`, `ordered`           |
| `forEachAwait(action, options)`  | `Promise<void>`    | `concurrency`, `ordered`, `signal` |

`forEachAwait` hands the action the position of the element **in the source**,
not the order the actions happened to finish in.
