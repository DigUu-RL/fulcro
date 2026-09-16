# @fulcro/collections

Lazily evaluated sequences with a composable query operator set — and, with its
optional compiler plugin, runtime validation derived from your own types.

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

```ts
// `response.json()` hands back `any`. This is the last place it is unchecked —
// and the schema is the interface you already wrote.
const orders = SequenceCollection.from(await response.json())
	.cast<Order>()
	.toArray();
```

Nothing is installed to get that second one: the transformer ships inside this
package. It is **optional** — every operator below works without it, and only
the type-argument forms need it. See
[validating by type](#validating-by-type-oftypet-and-castt).

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
| `choose` `ofType` `cast` `topBy` `tap`                    |                                                       |

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

`topBy` answers exactly what `orderByDescending(...).take(n)` answers — same
elements, same order, ties broken the same way — without sorting the part it is
going to discard. It keeps a window of the best `n` seen so far, so each element
costs one comparison against the weakest of them:

```ts
users.topBy((user) => user.score, 10);
```

Measured over a hundred thousand records for a top ten: **201,400 key
comparisons against 4,532,640 for the sort.** The cost per element does not grow
with how many you ask for, so a window of a thousand costs almost what a window
of one costs.

`choose` projects and filters in a single pass, for when the condition and the
projection are the same work:

```ts
// `findAccount` runs twice per user here…
users.where((u) => findAccount(u) !== null).select((u) => findAccount(u));

// …and once here.
users.choose((user) => findAccount(user));
```

`null` and `undefined` mean "nothing for this element". `0`, `''` and `false`
are kept, because they are answers.

`tap` runs an action for each element as it passes and yields it unchanged — for
looking inside a chain without collapsing it into a terminal operator.

## Validating by type: `ofType<T>()` and `cast<T>()`

Both narrow a mixed sequence to one type. They differ in what happens to an
element that does not fit, which is the reason to have both:

```ts
const values: unknown[] = ['a', 7, 'b'];

values.ofType('string'); // ['a', 'b'] — 7 is skipped
values.cast('string'); // throws on 7, naming the type and the index
```

Reach for `ofType` when the sequence is **expected** to be mixed, and `cast`
when a wrong element means the data is broken and silence would be the worst
outcome. Both take a `typeof` name or a class, and both narrow the element type
without a cast written by hand.

### Written as a type

With the plugin wired up, the type argument is enough:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
values.ofType<string>(); // → ofType('string')
values.ofType<Admin>(); // → ofType(Admin)
```

An **interface** has neither a `typeof` name nor a constructor — but it has a
shape, and the compiler knows it completely. So the check is written out:

```ts
interface Order {
	id: number;
	note?: string;
	tags: string[];
	customer: { email: string };
	status: 'pending' | 'paid';
	placedAt: Date;
}

orders.cast<Order>();
```

emits a test for every clause that type implies — the nested object, every
element of the array, the union, the `Date` by `instanceof`, the optional
property allowed to be absent. Which is what makes `cast<T>()` a validator for
untrusted data **derived from the type itself**, with no schema to keep in step
by hand.

Covered: primitives, literals, unions, intersections, objects and interfaces
nested to any depth, optional properties, arrays, fixed-length tuples, classes,
and the built-in classes by `instanceof`. Extra properties are accepted, because
structural typing accepts them.

**Types that contain themselves are covered too** — a comment tree, a folder
structure, a category with subcategories. One that refers back to itself becomes
a function that calls itself, built once where the call sits rather than per
element, and it descends the whole value.

### What it refuses, and why that is the point

A check that answers yes to the wrong thing is worse than no check: it is false
confidence exactly where the data is least trustworthy. So anything the plugin
cannot write out completely, it refuses — there is no partial or optimistic
check anywhere in it.

Refused: index signatures, unresolved generics, and a class imported with
`import type`, which is erased before the emitted code could reference it. Those
throw when the chain is **built**, naming both reasons a call could have arrived
unresolved, because from inside a running program they are indistinguishable.

For a refused type, write the check and pass it in the same shape:

```ts
values.ofType<Tree>({ name: 'Tree', matches: (v) => isTree(v) });
```

### What it costs

A shape check is **O(size of the value)** per element — every field of every
record, every element of every array inside it. That is the price of actually
checking, measured at about what the same check written by hand costs. It
short-circuits on the first failing clause, and stays lazy: `cast<Order>()
.take(5)` validates five records, not a hundred thousand.

## Types

The query contracts ship as interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — alongside the delegate types the operators take (`Predicate`,
`Selector`, `OptionalSelector`, `Comparer`, `Action`, `ResultSelector`,
`Accumulator`). Prefer them over the concrete classes when typing your own
signatures.

`TypeTest<R>` is the shape `ofType` and `cast` accept beyond a name or a class,
and the one the plugin emits.

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
