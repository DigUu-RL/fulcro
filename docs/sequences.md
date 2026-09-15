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
.choose((user) => user.email)              // transform, dropping what came back empty
.selectMany((order) => order.items)        // flatten nested arrays
.distinct()                                // drop duplicates
.distinctBy((user) => user.email)          // …comparing by a key
.ofType('string')                          // keep one runtime type, narrowing
.cast('string')                            // …or throw if any element is not
.tap((user) => console.log(user))          // look, without consuming
.reverse()
```

#### `choose` — project and filter in one pass

Where the condition and the projection are the same piece of work, splitting
them into `where().select()` means doing that work twice:

```ts
// The lookup runs twice for every user that has an account.
const accounts = users
	.where((user) => findAccount(user) !== null)
	.select((user) => findAccount(user));

// Once.
const accounts = users.choose((user) => findAccount(user));
```

`null` and `undefined` mean "nothing for this element". Everything else is kept,
**including `0`, `''` and `false`** — those are answers, and a projection that
means to drop them has to say so. The result type loses the nullability:
`choose` on a `string | null` gives you a `Sequence<string>`.

#### `ofType` and `cast` — the same question, two answers

Both narrow a mixed sequence to one type. They differ in what they do with an
element that does not fit, and that difference is the reason to have both:

```ts
const values: unknown[] = ['a', 7, 'b'];

values.ofType('string'); // ['a', 'b'] — 7 is skipped
values.cast('string'); // throws on 7
```

Reach for `ofType` when the sequence is **expected** to be mixed, and `cast`
when an element of another type means the data is wrong and silence would be
the worst outcome. The throw names what it found and where:

```text
TypeError: cast('string') found a number at index 2.
```

Both take either a `typeof` name or a class, and both narrow the type without a
cast written by hand:

```ts
.ofType('string')    .ofType('number')    .ofType('object')
.ofType(Date)        .cast(Order)
```

One deliberate disagreement with the language: `ofType('object')` does **not**
match `null`, though `typeof null` is `'object'`. A sequence narrowed to objects
that then throws on a property access would be a trap.

#### Writing the type as a type

With this package's transformer wired up, both take the type directly:

```ts
values.ofType<string>(); // Sequence<string>
values.ofType<Admin>(); // Sequence<Admin>
values.cast<Admin>(); // throws on the first that is not one
```

It resolves the type argument at compile time into the same token the other
forms take — `ofType<string>()` is emitted as `ofType('string')`, and
`ofType<Admin>()` as `ofType(Admin)`. Nothing about the runtime changes.

The plugin is **optional**, which is the difference from `@fulcro/reflect`:
every operator here works without it, and only these no-argument forms need it.
Wire it the same way:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
// vite.config.ts
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
```

Both can sit beside `@fulcro/reflect`'s plugin. Each rewrites only the calls it
can trace back to its own package, and neither knows the other exists.

#### An interface works too — it gets written out

A primitive becomes a `typeof` name and a class becomes its constructor. An
interface has neither, but it still has a **shape**, and the compiler knows it
completely. So the transformer writes the check out:

```ts
interface Order {
	id: number;
	note?: string;
	tags: string[];
	customer: { email: string };
	status: 'pending' | 'paid';
	placedAt: Date;
}

orders.ofType<Order>();
```

becomes, near enough:

```js
orders.ofType({
	name: 'Order',
	matches: (v) =>
		v !== null &&
		typeof v === 'object' &&
		typeof v.id === 'number' &&
		(v.note === undefined || typeof v.note === 'string') &&
		Array.isArray(v.tags) &&
		v.tags.every((e) => typeof e === 'string') &&
		v.customer !== null &&
		typeof v.customer === 'object' &&
		typeof v.customer.email === 'string' &&
		(v.status === 'pending' || v.status === 'paid') &&
		v.placedAt instanceof Date,
});
```

Which makes `cast<T>()` a **validator for untrusted data, derived from the type
itself**:

```ts
const orders = SequenceCollection.from(await response.json())
	.cast<Order>()
	.toArray();
```

`response.json()` hands back `any`. That line is the last place the data is
unchecked — and the schema is the interface you already wrote, so it cannot
drift out of step with it the way a hand-maintained one does.

Covered: primitives, literals, unions, intersections, objects and interfaces
nested to any depth, optional properties, arrays (every element, not a sample),
fixed-length tuples, classes, and `Date`, `Map`, `Set`, `RegExp` and friends by
`instanceof`.

**Extra properties are accepted**, because structural typing accepts them. An
object carrying more than `Order` requires is still an `Order`, and rejecting it
would make this disagree with the compiler that produced it.

#### What it refuses, and why that is the point

A check that answers "yes" to the wrong thing is worse than no check: it is
false confidence exactly where the data is least trustworthy. So anything the
transformer cannot write out completely, it refuses — there is no partial or
optimistic check anywhere in it.

Refused: types that contain themselves, index signatures, unresolved generics,
and a class brought in with `import type`, which is erased before the emitted
code could reference it.

```text
Error: ofType<T>() was not resolved at compile time. Either the
@fulcro/collections transformer did not run over this file, or T has no runtime
representation — an interface leaves nothing to test for, so pass a class, a
typeof name, or use where() with a predicate.
```

The message names both causes on purpose: from inside the running program they
are indistinguishable, and guessing between them would be worse than saying so.
It throws when the chain is **built**, not when it is first read — a call that
was never resolved is a build wired wrong, not data gone wrong.

For a refused type, write the check yourself and pass it in the same shape:

```ts
values.ofType<Tree>({
	name: 'Tree',
	matches: (v) => isTree(v),
});
```

#### What it costs

A shape check is **O(size of the value)** per element, not a constant: every
field of every record, and every element of every array inside it. That is the
honest price of actually checking, and on a hundred thousand records with nested
line items it is real work — measured at about what the same check written by
hand costs, which is the most that can be asked of it.

It short-circuits on the first clause that fails, and it is lazy like everything
else, so `cast<Order>().take(5)` validates five records rather than all of them.

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
.topBy((user) => user.score, 10)   // the best 10, without sorting the rest
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
	.topBy((row) => row.orders, 10)
	.toArray();
```

`topBy` answers exactly what `orderByDescending(...).take(10)` answers — same
elements, same order, ties broken the same way — without sorting the part it is
going to throw away. It keeps a window of the best ten seen so far, so each
element costs one comparison against the weakest of them.

On a hundred thousand records asking for ten, measured: **201,400 key
comparisons for `topBy` against 4,532,640 for the sort**, a factor of 22. The
cost per element does not grow with how many you ask for, which is why the
window can be a thousand for almost the same price as one.

Use the sort when you want the whole thing ordered; use `topBy` when you only
ever wanted the head of it.

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
