# Testing standard

Every feature in this repository carries **two** suites, and neither is
optional.

1. **Behaviour** — it does what it says.
2. **Performance** — it does it without costing more than it should.

A feature with only the first is not finished. This page says what the second
one has to look like, because a performance test written the obvious way is
usually worthless.

## Why timing is the wrong assertion

The instinct is to measure the clock:

```ts
// Don't.
const started = performance.now();
sequence.where(expensive).first();
expect(performance.now() - started).toBeLessThan(50);
```

That test is broken in both directions. It **fails** on a loaded CI runner that
did nothing wrong, and it **passes** on an implementation that quietly became
quadratic, as long as the machine is fast enough and the fixture small enough.
It tells you about the machine, not the code.

## Count the work instead

Assert how many times the code actually did something: elements pulled from a
source, projections invoked, keys extracted, comparisons made.

```ts
it('should stop all() at the first counterexample', () => {
	SequenceCollection.from(instrumentedSource(100_000)).all((v) => v < 3);

	expect(visits).toBe(4);
});
```

This is deterministic on every machine, and it encodes an **algorithmic
guarantee**. An implementation that lost its early termination reads a hundred
thousand elements instead of four — a failure of five orders of magnitude, not a
few percent of wall clock.

The instrumentation is a counter and a generator:

```ts
let visits = 0;

const instrumentedSource = (size: number): Iterable<number> => ({
	*[Symbol.iterator](): Iterator<number> {
		for (let index = 0; index < size; index++) {
			visits++;
			yield index;
		}
	},
});
```

Deliberately **not an array** — array fast paths would hide the traversals the
counter exists to observe.

## What is worth counting

| Guarantee         | Assert                                                       |
| ----------------- | ------------------------------------------------------------ |
| Lazy              | Nothing pulled while the chain is only described             |
| Early termination | Pulls stop at the element that settled the answer            |
| Single traversal  | Source read once per materialization, not once per operator  |
| Cached keys       | A sorting key extracted once per element, not per comparison |
| Indexed joins     | The inner side read once, not once per outer element         |
| Bounded memory    | Pulls at the first result never exceed the window or limit   |
| Known cardinality | `count()` answers without pulling anything                   |

## High volume, and real shapes

**Volume**, because an accidental quadratic is invisible at ten elements and
fatal at a hundred thousand. The counting suites use 100,000; the clock ceilings
use 1,000,000.

**Real shapes**, because a sequence of numbers is not what the library is used
for. A key projection over a number is free; one that reads
`order.customer.region` is not, and an operator calling it twice per comparison
rather than once per element only shows up on records:

```ts
interface Order {
	readonly id: number;
	readonly customerId: number;
	readonly region: string;
	readonly total: number;
	readonly placedAt: Date;
	readonly items: readonly LineItem[];
}
```

`realistic.performance.spec.ts` queries a hundred thousand of those against five
thousand customers — sorting by composite keys, joining, grouping, flattening
nested line items. Build the dataset **once**, in a `beforeAll`, or every budget
below it measures the builder.

## When the clock is the right tool

Two cases, and only two.

**Ratios.** Concurrency is only observable in time, but what is asserted is the
_relationship_, not a duration — a slow machine scales both sides:

```ts
// Forty waits of 5 ms, ten at a time, against the same work one at a time.
expect(concurrent).toBeLessThan(sequential / 3);
```

**Smoke ceilings.** Generous upper bounds that catch a catastrophic regression
and nothing subtler. Set them from what a linear implementation comfortably
achieves, then leave a wide margin:

```ts
expect(performance.now() - started).toBeLessThan(3_000);
```

If a ceiling ever fails, something turned seconds into minutes. It is not there
to detect a ten percent slowdown, and should never be tightened until it can.

### A budget measured against nothing is a budget that lies

Two assertions in the `@fulcro/reflect` suite were originally written as
absolute budgets — a hundred thousand calls in under a second. They passed when
that project ran alone and **failed when the whole workspace ran**, because the
other projects were using the machine. Nothing was slow; the test was measuring
contention.

The fix is to measure a baseline in the same run, on the same machine, and
compare:

```ts
const resolved = timed(() => nameOf(() => user.email));
const baseline = timed(() => 'email');

expect(resolved).toBeLessThan(baseline * 25);
```

Now the assertion says something real — _this costs about what a string literal
costs, because the transformer turned it into one_ — and a loaded machine scales
both sides equally. Prefer this shape to a bare number wherever the comparison
can be constructed.

## Microtasks over timers

Where a test is about _scheduling_ rather than duration, advance microtask turns
instead of waiting on real milliseconds. A suite built on timers gets slower with
every case added to it:

```ts
const turns = async (count: number): Promise<void> => {
	for (let turn = 0; turn < count; turn++) await Promise.resolve();
};
```

## Concurrency: count the peak

Never infer overlap from elapsed time — a timing assertion passes on a
sequential implementation whenever the machine is fast. Count it:

```ts
let running = 0;
let peak = 0;

// inside the work: running++; peak = Math.max(peak, running); ... running--;

expect(peak).toBe(6);
```

And assert **both** directions. `peak <= limit` alone is satisfied perfectly by
an implementation that never exceeded one.

## These tests find real bugs

That is not an aspiration. The memory assertion on `selectAwait` —

```ts
expect(pulledAtFirstResult).toBeLessThanOrEqual(4);
```

— failed with `expected 10000 to be less than or equal to 4`. The limit was
counting what was _running_ at that instant, and a selector that resolved
immediately left the set empty again before the loop re-checked it, so the whole
source drained into memory. Every behavioural test passed throughout: the values
were correct, and the memory was not.

## Where the suites live

| File                                          | Covers                          |
| --------------------------------------------- | ------------------------------- |
| `sequence/performance.spec.ts`                | The original operator set       |
| `sequence/operators.performance.spec.ts`      | Everything added since          |
| `sequence/realistic.performance.spec.ts`      | Records at volume               |
| `async/async.performance.spec.ts`             | Async sequences and concurrency |
| `functions/src/tests/performance.spec.ts`     | `switchFor`, `tryCatch`         |
| `reflect/src/tests/utils/performance.spec.ts` | `nameOf`, `typeOf`, `defaultOf` |

A new feature either extends one of these or brings its own.
