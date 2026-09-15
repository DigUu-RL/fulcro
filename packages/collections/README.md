# @fulcro/collections

Lazily evaluated sequences with a composable query operator set. No dependencies.

```ts
import { SequenceCollection } from '@fulcro/collections';

const active = SequenceCollection.from(users)
	.where((user) => user.active)
	.orderBy((user) => user.lastName)
	.thenByDescending((user) => user.createdAt)
	.select((user) => user.email)
	.take(10)
	.toArray();
```

## Laziness

Every operator returning another sequence is deferred. Nothing is traversed
until the result is consumed — by `toArray()`, by a scalar operator, or by a
`for...of` loop:

```ts
const query = SequenceCollection.from(orders).where(expensive); // nothing ran
const first = query.first(); // traverses only until the first match
```

That matters for more than allocation. `first()` on a filtered million-element
array stops at the first match, and a sequence built over a generator never
pulls more elements out of it than the query actually needs.

Operators returning a scalar, an array or a map — `count`, `sum`, `toArray`,
`toMap`, `first`, `any`, `aggregate`, `forEach` — run immediately.

## Creating a sequence

```ts
SequenceCollection.from(iterable); // array, Set, Map, string, generator…
SequenceCollection.empty<T>();
```

`from` accepts any `Iterable<T>`. The constructor is deliberately not public:
sequences are always built through these two, because both of them wrap the
instance in the `Proxy` that provides index access.

## Index access

A sequence can be read positionally, like an array:

```ts
const sequence = SequenceCollection.from([10, 20, 30]);
sequence[0]; // 10
sequence[9]; // undefined
```

This is served by a `Proxy`, so a sequence backed by something that is not
indexable is traversed until the position is reached. Reading `sequence[500]`
on a generator-backed sequence walks 501 elements; reading it on an
array-backed one does not.

## Operators

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

Two static factories build a sequence from nothing: `SequenceCollection.range`
and `SequenceCollection.repeat`. Both generate as they are read, so a million of
either costs nothing until something asks, and both report their count without
generating any of it.

`orderBy` and `orderByDescending` return an `OrderedSequence<T>`, which adds
`thenBy` and `thenByDescending`. Secondary criteria are only consulted when the
preceding ones consider two elements equivalent.

Sorting keeps the criteria as key projections rather than as comparison
functions, so each key is extracted once per element — `O(n)` calls — instead of
twice per comparison, which would grow as `O(n log n)`.

`groupBy` yields `Group<K, T>`, which is itself a full sequence carrying a `key`,
so operators chain straight onto a group. Keys come out in the order they were
first seen.

## Laziness has a second edge, and `memoize` is the guard

A sequence over a generator, or any other single-pass source, **yields nothing
on a second traversal** — and says nothing about it, because an exhausted
iterator is indistinguishable from an empty one:

```ts
const query = SequenceCollection.from(rows()).select(expensive);

query.count(); // reads the generator, runs `expensive` per row
query.toArray(); // [] — the generator is spent
```

A chain iterated twice also runs its projections twice, which is fine until the
projection is a parse or a request.

`memoize` fixes both. Elements are remembered as they are read, so the sequence
becomes repeatable and the work behind it happens once:

```ts
const kept = query.memoize();

kept.count(); // reads it once
kept.toArray(); // every row, and `expensive` never ran again
```

The cost is memory — everything pulled through is held — and it is paid only for
the part actually consumed.

## Beyond LINQ

A handful of operators that earn their place by doing something the standard set
cannot.

`partition` splits by a condition **in one traversal**, where two `where` calls
read the source twice:

```ts
const [active, archived] = users.partition((user) => user.active);
```

`scan` is `aggregate` that shows its work — a running total rather than only the
final one. It emits one value per element and not the seed, so it stays the same
length as its source:

```ts
SequenceCollection.from([1, 2, 3]).scan(0, (total, n) => total + n);
// 1, 3, 6
```

`windowed` and `pairwise` yield overlapping runs, for comparing an element with
what came before it:

```ts
readings.pairwise().select(([previous, current]) => current - previous);
```

`groupAdjacent` groups **consecutive** elements sharing a key, starting a new
group whenever the key changes — so the same key can open several. It buffers
only the run in hand, which `groupBy` cannot do, and fits data already in order.

And four statistics beside `sum`, `average`, `min` and `max`: `median`,
`percentile`, `standardDeviation` and `sampleStandardDeviation`. The two
deviations are separate names rather than one with a flag: they divide by `n`
and by `n - 1`, the answers diverge most exactly when the data is small, and a
quiet default would be wrong half the time.

## Types

The query contracts ship as interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — alongside the delegate types the operators take (`Predicate`,
`Selector`, `Comparer`, `Action`, `ResultSelector`, `Accumulator`). Prefer them
over the concrete classes when typing your own signatures.

## A note for bundler configuration

This package is **not** side-effect free, and does not declare itself as such.
Its barrels run a composition step on load that plugs the concrete group and
ordered classes into a factory registry. A bundler told to treat the package as
side-effect free would drop that step, and `groupBy`, `orderBy` and
`orderByDescending` would fail at runtime. No configuration is needed — just
don't add an override.

---

**Full guide:** [docs/sequences.md](../../docs/sequences.md) — scenarios, worked
examples and the failure modes worth knowing before you meet them.
