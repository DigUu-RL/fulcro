# Async, concurrency and parallelism

A design for the three things phase 5 covers, written before any of it is built
so the decisions can be argued with while they are still cheap to change.

Nothing here is implemented yet. The decisions it opened have since been
settled, and are collected at the end along with the order of the work.

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

### `concurrency` is required

An unbounded default is how rate limits get hit and file descriptors get
exhausted, and it fails in production rather than in development, where the
input is small. A default of `1` silently makes the operator pointless. Any
number in between is a guess about someone else's service.

So the type demands it. This is the same argument that was made for a required
`otherwise` on `switchFor` and rejected — rightly, because there the answer was
expressible in the type as `R | undefined`. Here there is no equivalent: a wrong
concurrency does not change the type, it changes how hard something external
gets hit, and only the caller knows what that thing tolerates.

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

Every terminal accepts an optional `AbortSignal`, the platform's own mechanism
for calling off work in progress:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

const users = await source
	.selectAwait(load, { concurrency: 8 })
	.toArray({ signal: controller.signal });
```

**What abort actually does, and what it cannot.** A promise has no cancel — the
language offers none, and nothing here can invent one. Aborting therefore means
two concrete things: no further work is started, and the terminal rejects with
the signal's reason. Calls already in flight keep running to completion and
their results are discarded. Anyone expecting `abort()` to kill eight requests
mid-flight will be wrong, and the documentation has to say so rather than let
them find out.

Work that takes a signal of its own — `fetch` being the obvious case — _can_ be
stopped, by closing over the same controller. The operator does not thread the
signal in for you, and deliberately so: the signal arrives at the terminal while
the selector was registered further up the chain, and carrying a context down
through every deferred operator would serve a case the caller can already write
with the controller they built:

```ts
const controller = new AbortController();

await source
	.selectAwait((id) => fetch(`/users/${id}`, { signal: controller.signal }), {
		concurrency: 8,
	})
	.toArray({ signal: controller.signal });
```

**It goes on the terminal**, not on the operators and not on `from`. Cancelling
is a property of consuming a sequence, not of describing one: the terminal is
where the waiting happens and where the promise that rejects lives, and the same
sequence can then be consumed twice under different signals. Putting it on `from`
would bind one signal to the sequence for its lifetime; putting it on each
operator would mean repeating the same signal at every stage to cancel the
chain.

## Part three — parallelism

This is the part that does not belong in the same package. It does, however,
belong in the browser as much as on a server — a library that only threads on
Node would be half a library, and the design below is portable rather than
ported.

### It is more portable than it looks

Almost everything this needs is a web standard that Node adopted, verified on
the Node 24 this repository targets:

| Needed                | Browser                              | Node 24                        |
| --------------------- | ------------------------------------ | ------------------------------ |
| Default worker count  | `navigator.hardwareConcurrency`      | same global, present           |
| Copying values across | structured clone                     | same, `structuredClone` global |
| Transferring buffers  | `ArrayBuffer` in a transfer list     | same                           |
| Cancellation          | `AbortSignal`                        | same global                    |
| Locating the work     | `new URL('./x.js', import.meta.url)` | same                           |

Only the worker itself differs, and only in its construction and how messages
are read:

```ts
// browser
const worker = new Worker(url, { type: 'module' });
worker.addEventListener('message', handler);

// node
import { Worker } from 'node:worker_threads';
const worker = new Worker(url);
worker.on('message', handler);
```

That is a thin adapter behind one interface — spawn, post, receive, terminate —
selected by the `exports` conditions of the package rather than by a runtime
check, so a bundle for the browser never contains a reference to
`node:worker_threads` and nothing has to be marked external.

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

`new URL(…, import.meta.url)` is also the form that survives bundling: it is the
shape Vite, Rollup, webpack and esbuild all recognise as a worker entry and
rewrite to the emitted asset. A bare string path would work on Node and break
the moment the browser build moved a file.

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

| Package                     | Holds                                | Runs on          | Dependencies |
| --------------------------- | ------------------------------------ | ---------------- | ------------ |
| `@fulcro/collections`       | `Sequence`, unchanged                | anywhere         | none         |
| `@fulcro/collections/async` | `AsyncSequence`, bounded concurrency | anywhere         | none         |
| `@fulcro/parallel`          | worker pool, `selectParallel`        | browser and Node | none         |

Async and concurrency are a subpath of the existing package: they share the
operator vocabulary, add no dependencies, and a reader who has met `Sequence`
already knows most of the surface. A separate entry point rather than the main
one, so that nothing of it reaches a bundle that only imports the synchronous
sequence.

Parallelism is its own package for reasons that have nothing to do with
portability. It carries a worker pool, a lifecycle and a failure model the other
two do not, and its API is shaped by a constraint — work named rather than
captured — that would look arbitrary sitting beside operators under no such
limit. Keeping it separate lets someone take the sequences without the threads.

Its `exports` carry `browser` and `node` conditions over one shared core, so the
platform difference is settled by the bundler rather than by a runtime check,
and a browser bundle never contains a reference to `node:worker_threads`.

**Versioned independently** from the other four. The fixed group exists because
a transformer is tied to the folder layout the library it serves publishes, a
coupling no compiler checks. Nothing of the sort binds this package: it
consumes `AsyncSequence` through its public types like any other consumer, and a
mismatch there is a type error rather than a silent fallback.

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

## Decisions, settled

1. **`concurrency` is required.** No default is right for someone else's
   service, and getting it wrong fails in production rather than in
   development.
2. **`AbortSignal` goes on the terminals.** Cancelling is a property of
   consuming a sequence, not of describing one.
3. **Parallelism supports the browser as a first-class target**, not as a port.
   Almost everything it needs is already a web standard Node adopted; only
   worker construction differs, behind `exports` conditions.
4. **`@fulcro/parallel` versions independently** of the other four. It has none
   of the layout coupling that forced the existing fixed group.

## Implementation order

Three pieces, in the order that keeps each one buildable and testable on its
own.

**First, `AsyncSequence` with one element in flight.** It is the foundation the
other two are expressed in — bounded concurrency is an operator on it, and the
worker pool returns one. Building it first means the other two never need a
temporary shape to stand on. It is also the piece with no timing in it, so its
suite is deterministic and fast.

**Then bounded concurrency**, which is where the hard parts live: a limit that
holds, an order that survives uneven durations, a rejection that leaves nothing
running, and a signal that stops new work. All of it testable with fake timers
and a counter, none of it needing a second thread.

**Last the worker pool**, because it is the only piece whose tests are slow, the
only one that touches two runtimes, and the only one whose value has to be
demonstrated by a benchmark rather than asserted. By then the async surface it
returns is already proven, so a failure there is a failure of the pool.
