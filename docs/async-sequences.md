# Async sequences

Querying data that arrives over time — pages of an API, lines of a file, rows
from a cursor — with the same operators you already know from
[`Sequence`](./sequences.md).

```sh
npm install @fulcro/collections
```

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

It lives behind its own subpath so a bundle that imports only the synchronous
sequence carries none of it.

## The thirty second version

```ts
const recentAdmins = await AsyncSequenceCollection.from(fetchUserPages())
	.where((user) => user.role === 'admin')
	.select((user) => user.email)
	.take(10)
	.toArray();
```

If you have used the synchronous sequence, you already know this one. **One rule
covers the whole surface:**

- Operators that used to return a `Sequence` now return an `AsyncSequence`, and
  keep their names.
- Operators that used to return a value now return a `Promise` of it, and keep
  their names.

There is no `toArrayAsync`, no `whereAsync`. `await` is the only thing that
changes at the call site.

## Where the elements come from

`from` takes three shapes, and you rarely have to think about which:

```ts
// Something that produces over time.
AsyncSequenceCollection.from(streamRows());

// A plain array or generator, lifted into the async world.
AsyncSequenceCollection.from([1, 2, 3]);

// An array of promises — the `ids.map(load)` shape.
AsyncSequenceCollection.from(ids.map((id) => loadUser(id)));
```

An async generator is usually how the first one is written:

```ts
async function* fetchUserPages(): AsyncGenerator<User> {
	let cursor: string | undefined;

	do {
		const page = await api.users({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}
```

Nothing in that function runs until something consumes the sequence, and it
stops being called the moment the consumer stops asking.

## Your functions can be sync or async — both just work

Every projection, predicate and action accepts either:

```ts
.where((user) => user.active)          // fine
.where(async (user) => isAllowed(user)) // also fine
```

You never wrap anything, and there is no second operator name to remember.

## Nothing runs until you ask, and nothing runs ahead

Two properties worth knowing, because they are what make this usable on data too
large to hold.

**Deferred.** Building a chain reads nothing:

```ts
const query = AsyncSequenceCollection.from(rows()).select(parse); // no I/O yet

const parsed = await query.toArray(); // now it reads
```

**Back pressure.** One element is pulled, processed, and only then is the next
asked for. A file being streamed is never buffered ahead of the code reading it.

And an operator that has what it needs stops pulling — which is the difference
between finishing and hanging on an endless source:

```ts
// `liveEvents()` never ends. This still returns.
const firstTen = await AsyncSequenceCollection.from(liveEvents())
	.take(10)
	.toArray();
```

## Real scenarios

### Paging an API without holding every page

```ts
const emails = await AsyncSequenceCollection.from(fetchUserPages())
	.where((user) => user.active)
	.select((user) => user.email)
	.toArray();
```

One page is in memory at a time, however many there are.

### Reading a large file line by line

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const lines = createInterface({
	input: createReadStream('access.log'),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const errors = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' 500 '))
	.take(100)
	.toArray();
```

`readline` is already an async iterable, so it drops straight in. Reading stops
after the hundredth error rather than at the end of the file.

### Writing in batches

```ts
await AsyncSequenceCollection.from(streamRows())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => database.insertMany(batch));
```

`chunk` is how a stream becomes batches without collecting the stream first.

### A running total as values arrive

```ts
const balances = AsyncSequenceCollection.from(transactions()).scan(
	0,
	(balance, entry) => balance + entry.amount,
);

for await (const balance of balances) render(balance);
```

## Cancelling

Every terminal accepts an `AbortSignal`:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

const users = await AsyncSequenceCollection.from(fetchUserPages()).toArray({
	signal: controller.signal,
});
```

**What abort does, and what it cannot.** A promise has no cancel — that is a fact
about JavaScript, not a gap here. So aborting does exactly two things:

1. No further element is pulled.
2. The promise you are awaiting rejects with the signal's reason.

Work already in flight keeps running to completion; its result is thrown away.
If you expected `abort()` to kill a request mid-flight, it does not — unless the
work itself takes a signal, in which case hand it the same one and it does:

```ts
.select((id) => fetch(`/users/${id}`, { signal: controller.signal }))
```

A signal belongs on the terminal rather than on `from`, which means the same
sequence can be consumed twice under different signals.

`AbortSignal.timeout(5_000)` is a shorthand for the controller above.

## What is different from the synchronous sequence

|                  | `Sequence`    | `AsyncSequence`            |
| ---------------- | ------------- | -------------------------- |
| Consumed with    | `for...of`    | `for await...of`           |
| Terminals return | the value     | a `Promise` of it          |
| Index access     | `sequence[5]` | `elementAtOrNull(5)`       |
| `count()`        | often `O(1)`  | always traverses           |
| Cancellation     | —             | `AbortSignal` on terminals |

**Index access is gone**, and it is not an oversight: `sequence[5]` would have to
hand back a promise from a property read, which means something entirely
different from what it means on the synchronous sequence. `elementAtOrNull(5)`
is the way in.

**`count()` always traverses.** The synchronous sequence can often answer in
`O(1)` because an array declares its length. An `AsyncIterable` declares nothing,
so there is nothing to read ahead of time.

## Operators

| Deferred                                      | Terminal                                  |
| --------------------------------------------- | ----------------------------------------- |
| `where` `select` `selectMany`                 | `toArray` `toSet` `count`                 |
| `take` `skip` `takeWhile` `skipWhile`         | `any` `all` `contains`                    |
| `takeLast` `skipLast`                         | `first` `firstOrNull` `last` `lastOrNull` |
| `distinct` `distinctBy` `concat`              | `single` `singleOrNull`                   |
| `chunk` `scan` `windowed` `pairwise`          | `elementAt` `elementAtOrNull`             |
| `append` `prepend` `defaultIfEmpty`           | `sum` `average` `min` `max`               |
| `choose` `ofType` `cast` `topBy` `tap`        | `minBy` `maxBy` `sequenceEqual`           |
| `groupAdjacent` `zip`                         | `countBy` `toMap` `toLookup`              |
| `except` `exceptBy` `intersect` `intersectBy` | `standardDeviation`                       |
| `union` `unionBy` `join` `groupJoin`          | `sampleStandardDeviation`                 |
|                                               | `forEach` `aggregate`                     |

Plus the concurrent forms: `selectAwait`, `whereAwait`, `chooseAwait`,
`topByAwait` and the terminal `forEachAwait`.

### What is deliberately missing

Six operators of the synchronous sequence are **not** here, and their absence is
the design rather than a gap: `orderBy`, `orderByDescending`, `reverse`,
`groupBy`, `median` and `percentile`.

Every one of them has to hold the entire source before it can produce anything.
`orderBy` cannot emit a first element until the last has arrived; `groupBy`
cannot close a group until it knows no more members are coming. Offering them
with the same shape as the rest would be a memory trap wearing an ordinary
operator's clothes — fine on the fixture in a test, ruinous on the feed in
production.

When you want them, say so out loud:

```ts
const sorted = SequenceCollection.from(await stream.toArray()).orderBy(
	(row) => row.name,
);
```

`toArray()` is where holding everything becomes visible, which is exactly where
it belongs.

Two that do stream are worth knowing as the answers to the same questions:
**`groupAdjacent`** groups consecutive elements and closes a run as soon as the
key changes, and **`topBy`** ranks without sorting, holding a window rather than
the stream.

### Which of these actually stream

Most hold nothing beyond a window. Three are worth calling out.

**`takeLast` cannot yield before the source ends** — nothing knows the last ten
of something still arriving. What it does keep bounded is memory: ten elements,
not the stream. Its sibling `skipLast` _does_ stream, releasing an element once
`count` more have arrived behind it.

**The set operations and joins read their argument first**, whole, before
yielding anything. What that bounds is the sequence you pass in, never the one
you called it on — so a stream belongs on the outside of a `join`, and a
reasonably sized collection on the inside.

**`countBy` and `toLookup` grow with the number of distinct keys.** Counting by
category over an endless feed is fine; counting by identifier is not.

## Validating a stream as it arrives

`cast<T>()` is here too, and this is where it earns the most. Untrusted data
usually arrives asynchronously — a paginated API, a file being read, a queue —
and the synchronous path would mean collecting all of it in memory first, which
is the thing this type exists to avoid.

```ts
const orders = AsyncSequenceCollection.from(paginatedOrders()).cast<Order>();

for await (const order of orders) {
	// `order` is an `Order`, checked, one page at a time.
}
```

It refuses **at the element that failed**, so a bad page is caught without the
rest of the feed being fetched:

```text
TypeError: FULCRO1015: cast('Order') found a string at index 2.
```

`ofType<T>()` is the same check used to filter rather than to refuse. Both take
a `typeof` name, a class, a test you write, or — with the package's transformer
wired up — the type itself, interfaces included. The full account of what is
covered and what is refused is in
[sequences.md](./sequences.md#validating-by-type-oftypet-and-castt); it behaves
identically here.

## `topBy` on a stream

Ranking normally means sorting, and sorting means having everything. `topBy`
keeps a window of the best `count` seen so far instead, so what it holds is
bounded by `count` and not by the length of the stream:

```ts
const busiest = await AsyncSequenceCollection.from(everyRequest())
	.topBy((request) => request.duration, 10)
	.toArray();
```

A hundred thousand elements for a top ten holds ten. It does have to reach the
end before it can answer — nothing can know the top ten of a stream that has not
finished — so put a `take` in front of an endless one.

`topByAwait` extracts several keys at once, for a key that has to be fetched
rather than read. Ties still break on **arrival**, which is recorded before the
keys are extracted: concurrent work finishes in an order that has nothing to do
with the input, and letting that decide would make the answer depend on which
lookup happened to be quickest.

## `choose` and `tap`

`choose` projects and filters in one pass, awaiting one element at a time;
`chooseAwait` runs several projections at once. The concurrency limit counts
projections **in flight**, not results kept — dropping a result does not free a
slot, or the limit would quietly depend on how much the projection discards.

`tap` observes without consuming, and **awaits** the action before handing the
element on. That is deliberate: an action that writes somewhere should hold the
stream where it is rather than falling behind the elements it is meant to be
observing.
