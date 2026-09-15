# Async, concurrency and parallelism

A design for the three things phase 5 covers, written before any of it is built
so the decisions can be argued with while they are still cheap to change.

Nothing here is implemented yet. Where a decision is still open it says so, and
every one of those is collected at the end.

## The three are not variations of each other

They get discussed as if they were a spectrum, and treating them that way is how
the wrong one gets reached for.

**Asynchrony** is about elements that are not all available yet. A page of an
API, a line of a file being streamed, a row arriving from a database cursor. The
sequence exists over time rather than in memory, and the cost being managed is
_waiting_.

**Bounded concurrency** is about overlapping that waiting. Ten requests in
flight finish in roughly the time of the slowest rather than the sum of all ten.
Nothing runs at the same instant — it is one thread, interleaving while each
call is blocked on something outside the process. The cost being managed is
still waiting, and the limit exists because the thing on the other end has a
limit.

**Parallelism** is about work that is not waiting on anything. Parsing, hashing,
compressing, transforming a large array. No amount of interleaving helps,
because nothing is ever idle — the CPU is the bottleneck, and the only way
through it is more cores. In JavaScript that means `worker_threads`, and it
brings a cost the other two do not have: every value crossing a thread boundary
is copied, and every function crossing it must be loadable by name rather than
captured from scope.

The practical consequence: **concurrency helps I/O and does nothing for CPU;
parallelism helps CPU and is a net loss for I/O.** An API that blurs them
invites reaching for threads to speed up `fetch`, which adds serialisation cost
to something that was never CPU-bound.

## Part one — `AsyncSequence`

The synchronous `Sequence<T>` is built on `Iterable<T>`. Its counterpart is
built on `AsyncIterable<T>`, which is the language's own answer to the same
question and what `for await...of` consumes.

```ts
interface AsyncSequence<T> extends AsyncIterable<T> {
	where(predicate: Predicate<T>): AsyncSequence<T>;
	select<R>(selector: Selector<T, R>): AsyncSequence<R>;

	toArray(): Promise<T[]>;
	count(predicate?: Predicate<T>): Promise<number>;
	first(predicate?: Predicate<T>): Promise<T>;
}
```

The shape of the rule is simple and worth stating once rather than per operator:
**every deferred operator keeps its name and returns an `AsyncSequence`; every
terminal keeps its name and returns a `Promise` of what it returned before.**
There is no `toArrayAsync`. The type already says it.

### Getting in and out

```ts
AsyncSequenceCollection.from(source: AsyncIterable<T>): AsyncSequence<T>;
AsyncSequenceCollection.from(source: Iterable<T>): AsyncSequence<T>;
AsyncSequenceCollection.from(source: Iterable<PromiseLike<T>>): AsyncSequence<T>;
```

The second overload is what makes a synchronous sequence usable where an
asynchronous one is wanted, and the third covers the common `array.map(fetch)`
shape.

Going back the other way is `toArray()`, and deliberately nothing more — a
`toSequence()` that waited for everything would hide the wait inside something
that reads as a conversion.

### Selectors that may or may not be async

Every projection accepts both:

```ts
type Selector<T, R> = (value: T) => R;
type AsyncSelector<T, R> = (value: T) => R | PromiseLike<R>;
```

`select` takes the async form and awaits when it gets a promise. A synchronous
selector then costs nothing extra beyond the `await` on an already-settled
value, and there is no second operator name to remember.

### What does not carry over

**Index access.** The synchronous sequence supports `sequence[5]` through a
`Proxy`. An asynchronous one cannot: the value is not there to return, and a
`Proxy` cannot hand back a promise from a property read without making
`sequence[5]` mean something entirely different from what it means today.
`elementAt(5)` returns a `Promise<T>` and is the only way in.

**Cardinality without traversal.** `count()` on the synchronous sequence often
answers in `O(1)` by carrying a known count through the chain. That machinery
stays where a source declares a length, but an `AsyncIterable` has no length to
declare, so in practice most async chains traverse.

### Ordering and back pressure

Operators pull one element at a time and process it before pulling the next, so
a source that produces faster than the consumer reads is never allowed to run
ahead. That is the default, and it is what keeps a sequence over a large file
from buffering the file.

Bounded concurrency deliberately breaks it, which is the whole of part two.

## Part two — bounded concurrency

```ts
selectAwait<R>(
	selector: AsyncSelector<T, R>,
	options: ConcurrencyOptions,
): AsyncSequence<R>;

forEachAwait(action: AsyncAction<T>, options: ConcurrencyOptions): Promise<void>;
whereAwait(predicate: AsyncPredicate<T>, options: ConcurrencyOptions): AsyncSequence<T>;
```

The `Await` suffix marks the operators that overlap work. `select` awaits one
element at a time; `selectAwait` keeps several in flight. Making it a separate
name rather than an option on `select` keeps the ordinary case free of a
decision it does not need to make.

### `concurrency` has no default — open decision

An unbounded default is how rate limits get hit and file descriptors get
exhausted, and it fails in production rather than in development, where the
input is small. A default of `1` silently makes the operator pointless. Any
number in between is a guess about someone else's service.

The proposal is that `concurrency` is **required**, and the type enforces it.
This is the same argument that was made for a required `otherwise` on
`switchFor`, which was rejected — and rightly, because there the answer was
expressible in the type as `R | undefined`. Here there is no equivalent: a wrong
concurrency does not change the type, it changes how hard something external
gets hit.

**Decision needed.** Required, or a conservative default such as `4`?

### Order is preserved, by default

Two reasonable behaviours:

- **Ordered.** Results come out in the order the inputs went in. A slow element
  holds back the ones behind it, though they still _ran_ concurrently.
- **By completion.** Results come out as they finish. No head-of-line blocking,
  and the order no longer corresponds to the input.

The proposal is ordered by default, because it is the one that composes: a
`selectAwait` in the middle of a chain should not silently change what `zip` or
`pairwise` further down are pairing. Completion order is available explicitly:

```ts
selectAwait(fetchUser, { concurrency: 8, ordered: false });
```

### Failure stops the sequence

When a selector rejects, the sequence rejects. Work already in flight is awaited
before that rejection surfaces, so nothing is left running unobserved and no
unhandled rejection appears later from a task nobody was waiting on. No new work
is started.

Collecting failures instead of stopping is already expressible without a second
mode, by composing with the `Result` type from `@fulcro/functions`:

```ts
const outcomes = await source
	.selectAwait((id) => tryCatch(() => load(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

That is a good sign about both designs, and it is worth documenting as the
intended path rather than adding a `settled: true` flag that would duplicate it.

### Cancellation

Every terminal accepts an optional `AbortSignal`:

```ts
await sequence.toArray({ signal });
```

An aborted signal stops new work and rejects with the signal's reason. In-flight
work is not killed — it cannot be, since a promise has no cancel — but it is
awaited and discarded.

**Open decision.** Whether `signal` belongs on the terminals, on the
`ConcurrencyOptions`, or on `from`. Terminals are proposed because that is where
the waiting actually happens.

## Part three — parallelism

This is the part that does not belong in the same package, and possibly not
behind the same shape of API.

### Why a closure cannot cross

The obvious API is the one that cannot work:

```ts
// Not possible.
sequence.selectParallel((row) => expensiveParse(row), { workers: 4 });
```

A worker is a separate JavaScript realm. A function passed to it has to be
serialised, and a closure's captured scope is not serialisable — `expensiveParse`
and everything it refers to exist only in the calling realm. Libraries that
appear to support this either stringify the function and lose its scope silently,
or spawn a worker that re-imports the whole calling module and hope it has no
side effects.

The honest API names the work instead of capturing it:

```ts
sequence.selectParallel(
	{ module: new URL('./parse.js', import.meta.url), export: 'parseRow' },
	{ workers: 4 },
);
```

The worker imports that module and calls that export. The function is a module
boundary, which is a thing that genuinely crosses realms, and nothing is
pretending otherwise.

### What the data costs

Every element is structured-cloned on the way in and the result on the way out.
That is a real copy, proportional to size. It rules out functions, class
instances with behaviour, and anything holding a reference to the outside world;
it allows plain objects, arrays, typed arrays, `Map`, `Set` and `Date`.

`ArrayBuffer` can be _transferred_ rather than copied, which moves ownership
instead, and for large binary payloads that is the difference between worthwhile
and not. Worth supporting explicitly.

### It is often slower, and the docs have to say so

There is a threshold below which the copy and the scheduling cost more than the
work saved. It depends on element size and work per element, so no single number
belongs in the documentation — but a **benchmark in the repository** showing
where the crossover falls for a realistic payload does, because the alternative
is a reader assuming more workers is always better.

The suite should also assert the unglamorous part: that a pool of `n` never runs
more than `n` at once, that a worker crashing surfaces as a rejection rather
than a hang, and that the pool shuts down when the sequence is done, including
when it ends early.

## Packaging

| Package                     | Holds                                | Dependencies    |
| --------------------------- | ------------------------------------ | --------------- |
| `@fulcro/collections`       | `Sequence`, unchanged                | none            |
| `@fulcro/collections/async` | `AsyncSequence`, bounded concurrency | none            |
| `@fulcro/parallel`          | worker pool, `selectParallel`        | none, Node only |

Async and concurrency are a subpath of the existing package: they share the
operator vocabulary, add no dependencies, and a reader who has met `Sequence`
already knows most of the surface. A separate entry point rather than the main
one so that nothing of it reaches a bundle that only imports the synchronous
sequence.

Parallelism is its own package because it is the only one of the three that is
**not portable** — `worker_threads` is Node, and a browser would need
`Web Worker` with a different module loading story. Putting it behind its own
name keeps `@fulcro/collections` usable in a browser and makes the platform
constraint visible at install time rather than at runtime.

**Open decision.** Whether `@fulcro/parallel` joins the fixed version group with
the other four, or versions independently. It has no compile-time coupling of
the sort that forced `reflect` and `transformer` together, so independent is
defensible here.

## Testing

Concurrency tests are the ones that pass by accident, so:

- **Maximum in flight is asserted, not inferred.** A counter incremented on
  entry and decremented on exit, with the peak checked against the limit. A
  test that only measures elapsed time passes on a sequential implementation
  when the machine is fast.
- **Ordering is asserted against deliberately uneven durations**, so an
  implementation that happens to preserve order on equal timings fails.
- **Rejection is asserted to leave nothing running**, by counting completions
  after the rejection surfaces.
- **Timers are faked** where the test is about scheduling rather than duration,
  so the suite does not get slower with every case added.

## Decisions to settle before implementation

1. **`concurrency`** — required, or defaulted to a conservative number?
2. **`AbortSignal`** — on the terminals, on the options, or on `from`?
3. **Phase order** — async and concurrency first with parallelism after, or all
   three before any of it ships?
4. **`@fulcro/parallel` versioning** — in the fixed group, or independent?
5. **Browser support for parallelism** — out of scope for now, or designed for
   from the start so a `Web Worker` backend can be added without changing the
   API?
