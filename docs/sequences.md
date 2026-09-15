# Sequences

Querying arrays, sets, maps and generators with composable operators that only
do the work you actually ask for.

```sh
npm install @fulcro/collections
```

```ts
import { SequenceCollection } from '@fulcro/collections';
```

## The thirty second version

```ts
const topEmails = SequenceCollection.from(users)
	.where((user) => user.active)
	.orderBy((user) => user.lastName)
	.thenByDescending((user) => user.createdAt)
	.select((user) => user.email)
	.take(10)
	.toArray();
```

Reads like a query, and behaves like one: nothing runs until `toArray()` asks.

## Laziness is the whole point

Building a chain does **no work**:

```ts
const query = SequenceCollection.from(orders).where(expensive); // nothing ran
```

The work happens when something consumes it — `toArray()`, a scalar operator, or
a `for...of` loop. And only as much as it needs:

```ts
query.first(); // stops at the first match, however many orders there are
```

On a million-element array filtered down to a handful, `first()` may look at
three elements. An eager implementation looks at a million, then throws away
999,999 results.

It works on infinite sources for the same reason:

```ts
const naturals = function* () {
	for (let n = 0; ; n++) yield n;
};

SequenceCollection.from(naturals())
	.where((n) => n % 7 === 0)
	.take(5)
	.toArray(); // [0, 7, 14, 21, 28]
```

### Which operators run immediately

Anything that returns a value rather than a sequence: `toArray`, `count`, `sum`,
`first`, `any`, `aggregate`, `forEach`, and the rest of the right-hand column in
the [reference](#reference) below.

## Creating a sequence

```ts
SequenceCollection.from(anything); // array, Set, Map, string, generator…
SequenceCollection.empty<T>();
SequenceCollection.range(1, 100); // 1..100
SequenceCollection.repeat('x', 3); // 'x', 'x', 'x'
```

`range` and `repeat` generate as they are read, so a million of either costs
nothing until something asks — and both can report their count without
generating any of it.

## Index access

A sequence reads positionally, like an array:

```ts
const sequence = SequenceCollection.from([10, 20, 30]);

sequence[1]; // 20
sequence[9]; // undefined
```

Served by a `Proxy`. On an array-backed sequence it is a direct read; on a
generator-backed one it walks until it reaches the position, so `sequence[500]`
costs 501 steps.

## Finding the operator you want

### Filtering and shaping

```ts
.where((user) => user.active)              // keep what matches
.select((user) => user.email)              // transform each
.selectMany((order) => order.items)        // flatten nested arrays
.distinct()                                // drop duplicates
.distinctBy((user) => user.email)          // …comparing by a key
.reverse()
```

### Taking a slice

```ts
.take(10)          .takeLast(10)     .takeWhile((n) => n < 100)
.skip(10)          .skipLast(10)     .skipWhile((n) => n < 100)
.chunk(100)        // arrays of 100
.windowed(3)       // overlapping runs of 3
.pairwise()        // each element with the one before it
```

`takeWhile` stops at the first element that fails — unlike `where`, which would
keep a later match.

### Ordering

```ts
.orderBy((user) => user.lastName)
.thenByDescending((user) => user.createdAt)
```

Secondary criteria are only consulted when the earlier ones tie. Sorting extracts
each key **once per element**, not twice per comparison, which on a hundred
thousand records is the difference between 100,000 and 1,700,000 calls to your
projection.

### Grouping

```ts
.groupBy((order) => order.customerId)      // all orders per customer
.groupAdjacent((line) => line.level)       // runs of consecutive equal keys
.countBy((order) => order.status)          // Map<status, count>
.toLookup((order) => order.customerId)     // Map<id, orders[]>
```

`groupBy` collects a key wherever it appears; `groupAdjacent` starts a new group
every time the key changes, and buffers only the run in hand. Use the second for
data already in order — log lines, readings by day.

A `Group<K, T>` is a full sequence carrying a `key`, so operators chain onto it:

```ts
.groupBy((order) => order.customerId)
.select((group) => ({ id: group.key, total: group.sum((o) => o.amount) }))
```

### Combining two sequences

```ts
.concat(more)                    // everything from both
.union(more)                     // both, without duplicates
.intersect(more)                 // only what is in both
.except(exclusions)              // what is not in the other
.zip(names, (id, name) => …)     // pairwise, stopping at the shorter
```

Each has an `*By` counterpart taking a key selector — `unionBy`, `exceptBy`,
`intersectBy` — which is usually what you want with records.

### Joining

```ts
// One result per matching pair, like a SQL inner join.
.join(customers, (o) => o.customerId, (c) => c.id, (o, c) => ({ …o, c }))

// One result per outer element, with its matches as a group — a left join.
.groupJoin(orders, (c) => c.id, (o) => o.customerId, (c, theirs) => …)
```

The inner sequence is indexed once, not once per outer element.

### Getting a single element

```ts
.first()            .firstOrNull()       // throws / null when empty
.last()             .lastOrNull()
.single()           .singleOrNull()      // exactly one, or it is an error
.elementAt(5)       .elementAtOrNull(5)
```

`single` differs from `first` on purpose: a second match is as much of a problem
as none. `singleOrNull` still throws on two — an ambiguous answer is a defect in
the query, not an absence to tolerate.

### Asking a question

```ts
.any()                          .any((o) => o.total > 100)
.all((o) => o.paid)
.contains(order)
.count()                        .count((o) => o.paid)
.sequenceEqual(other)
```

`count()` often answers **without traversing** — an array knows its length, and
that knowledge survives `select`, `take`, `skip`, `concat`, `chunk` and more.

### Numbers

```ts
.sum((o) => o.total)         .average((o) => o.total)
.min((o) => o.total)         .max((o) => o.total)
.minBy((o) => o.total)       .maxBy((o) => o.total)   // the record, not the value
.median((o) => o.total)      .percentile(95, (o) => o.total)
.standardDeviation((o) => o.total)
.sampleStandardDeviation((o) => o.total)
```

`min` gives you the smallest number; `minBy` gives you the **order that carried
it**, which is usually what you wanted.

The two standard deviations are separate names rather than one with a flag. They
divide by `n` and by `n - 1`, the answers diverge most exactly when the data is
small, and a quiet default would be wrong half the time. Use the population form
for the whole set, the sample form for a sample drawn from something larger.

### Accumulating

```ts
.aggregate(0, (total, o) => total + o.amount)   // one final value
.scan(0, (total, o) => total + o.amount)        // every running value
```

`scan` is `aggregate` that shows its work — a balance after each transaction
rather than only the last one. It emits one value per element, so it stays the
same length as its source and can be zipped with it.

### Splitting in one pass

```ts
const [active, archived] = users.partition((user) => user.active);
```

Two `where` calls read the source twice. This reads it once — which a generator
cannot survive otherwise, and which halves the work of an expensive predicate.

### Materializing

```ts
.toArray()      .toSet()
.toMap((u) => u.id)        // rejects a duplicate key
.toLookup((u) => u.team)   // collects duplicates instead
```

## The one thing that will surprise you

A sequence over a **generator** — or any other single-pass source — yields
nothing on a second traversal. Silently, because an exhausted iterator is
indistinguishable from an empty one:

```ts
const query = SequenceCollection.from(rows()).select(expensive);

query.count(); // reads the generator
query.toArray(); // [] — the generator is spent
```

A chain iterated twice also runs its projections twice, which is fine until the
projection is a parse or a request.

`memoize` fixes both:

```ts
const kept = query.memoize();

kept.count(); // reads it once
kept.toArray(); // every row, and `expensive` never ran again
```

Elements are remembered as they are read, so the cost is memory — paid only for
the part you actually consumed.

**Arrays are not affected.** This only bites on generators, iterators and
anything else that can be walked once.

## Real scenarios

### A top-ten list from a large array

```ts
const busiest = SequenceCollection.from(orders)
	.groupBy((order) => order.customerId)
	.select((group) => ({ id: group.key, orders: group.count() }))
	.orderByDescending((row) => row.orders)
	.take(10)
	.toArray();
```

### Paging

```ts
const page = SequenceCollection.from(results)
	.where((row) => row.region === region)
	.orderByDescending((row) => row.score)
	.skip(page * size)
	.take(size)
	.toArray();
```

### Batching writes

```ts
SequenceCollection.from(rows)
	.chunk(500)
	.forEach((batch) => database.insertMany(batch));
```

### Detecting gaps in a series

```ts
const gaps = SequenceCollection.from(readings)
	.orderBy((reading) => reading.takenAt)
	.pairwise()
	.where(([before, after]) => after.takenAt - before.takenAt > threshold)
	.toArray();
```

### Splitting valid from invalid, once

```ts
const [valid, invalid] = SequenceCollection.from(rows).partition(isValid);

await save(valid.toArray());
report(invalid.count());
```

## A note for bundler configuration

This package is **not** side-effect free and does not declare itself as such.
Its barrels run a composition step on load that plugs the concrete group and
ordered classes into a factory registry. A bundler told to treat it as
side-effect free would drop that step, and `groupBy`, `orderBy` and
`orderByDescending` would fail at runtime.

No configuration is needed — just do not add an override.

## Types

The contracts ship as interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — alongside the delegate types the operators take (`Predicate`,
`Selector`, `Comparer`, `Action`, `ResultSelector`, `Accumulator`). Prefer them
over the concrete classes in your own signatures:

```ts
const activeUsers = (users: Sequence<User>): Sequence<User> =>
	users.where((user) => user.active);
```

## Reference

| Deferred                                                  | Immediate                                             |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `where` `select` `selectMany`                             | `first` `firstOrNull` `last` `lastOrNull`             |
| `take` `skip` `takeWhile` `skipWhile`                     | `single` `singleOrNull` `elementAt` `elementAtOrNull` |
| `takeLast` `skipLast` `chunk` `windowed`                  | `count` `countBy` `any` `all` `contains`              |
| `distinct` `distinctBy` `reverse`                         | `sum` `average` `min` `max` `minBy` `maxBy`           |
| `union` `unionBy` `intersect` `intersectBy`               | `median` `percentile` `standardDeviation`             |
| `except` `exceptBy` `concat` `zip`                        | `sampleStandardDeviation` `sequenceEqual`             |
| `append` `prepend` `defaultIfEmpty`                       | `toArray` `toMap` `toLookup` `toSet`                  |
| `join` `groupJoin` `groupBy` `groupAdjacent`              | `forEach` `aggregate` `partition`                     |
| `orderBy` `orderByDescending` `scan` `pairwise` `memoize` |                                                       |

Statics: `from`, `empty`, `range`, `repeat`. On an `OrderedSequence`: `thenBy`,
`thenByDescending`.

## Next

- [Async sequences](./async-sequences.md) — the same operators over data that
  arrives over time.
- [Bounded concurrency](./concurrency.md) — running several elements at once.
