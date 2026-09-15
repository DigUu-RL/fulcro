# @diguu/collections

Lazily evaluated sequences with a composable query operator set. No dependencies.

```ts
import { SequenceCollection } from '@diguu/collections';

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

| Deferred                                | Immediate                                 |
| --------------------------------------- | ----------------------------------------- |
| `where` `select` `selectMany`           | `first` `firstOrNull` `last` `lastOrNull` |
| `take` `skip` `distinct`                | `count` `any` `sum` `average` `min` `max` |
| `union` `intersect` `join`              | `toArray` `toMap` `forEach` `aggregate`   |
| `groupBy` `orderBy` `orderByDescending` |                                           |

`orderBy` and `orderByDescending` return an `OrderedSequence<T>`, which adds
`thenBy` and `thenByDescending`. Secondary criteria are only consulted when the
preceding ones consider two elements equivalent.

Sorting keeps the criteria as key projections rather than as comparison
functions, so each key is extracted once per element — `O(n)` calls — instead of
twice per comparison, which would grow as `O(n log n)`.

`groupBy` yields `Group<K, T>`, which is itself a full sequence carrying a `key`,
so operators chain straight onto a group. Keys come out in the order they were
first seen.

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
