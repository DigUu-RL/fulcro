# Structured tasks

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/tasks.md)

Tasks that start together, end together, and can be called off — for work that
spends its time **waiting**: requests, queries, files.

```sh
npm install @fulcro/parallel
```

```ts
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';
```

## Is this the tool you want?

| Your work                                           | Reach for                                               |
| --------------------------------------------------- | ------------------------------------------------------- |
| One sequence of elements, each waiting on something | [`selectAwait`](./concurrency.md) — bounded concurrency |
| Several different jobs that wait, as one unit       | This                                                    |
| Burning CPU: parsing, hashing, resizing             | [A worker pool](./parallelism.md)                       |

A task runs on the thread that spawned it. Waiting overlaps — ten requests in
flight take about as long as the slowest — but computing does not: a hundred
tasks hashing a buffer take as long as one task hashing all hundred. For
that, the work has to reach other cores, and only a worker pool does that.

## A scope

```ts
await using scope = createTaskScope();

const user = scope.spawn((token) => loadUser(id, token.signal));
const orders = scope.spawn((token) => loadOrders(id, token.signal));

await scope.join();

render(await user, await orders);
```

`spawn` starts the work and hands back a `Task`, which you await for its value.
`join` waits for every task in the scope — including any a task spawned while
it was waiting — and then closes the scope: a `spawn` afterwards throws
[`FULCRO3011`](./errors/FULCRO3xxx.md#fulcro3011).

The work never starts during `spawn` itself; it starts a microtask later. That
leaves room to call a task off in the same breath as spawning it, and it still
never runs.

**No task outlives its scope.** Declared with `await using`, the scope waits for
every task when the block ends, however the block is left. Tasks still running
at that point are called off first — leaving the block without joining means
nobody wants their results.

## How many run at once

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const url of urls) {
	scope.spawn((token) => fetch(url, { signal: token.signal }));
}

await scope.join();
```

With a limit, a task spawned beyond it waits for one to finish, unstarted and
in the order it was spawned. A waiting task has started nothing: it holds
only what it needs to start, or to be called off — no request, no response —
so ten thousand requests can be spawned at once while only eight are
ever in flight — which is what the server at the other end, and the memory of
the responses, usually needs.

**The waiting queue has no bound of its own:** it holds every task you spawn
beyond the limit, because you already hold the work that spawning them
expresses. Each waiting task costs an `AbortController`, a listener on the
scope's signal and a few promises — small, but not free, so spawn a million
and a million are held. To bound it, spawn in batches and `join` between them.
What is let go is let go at once: a task that started, or was called off while
waiting, is not held by the queue afterwards, however long the scope lives.

The limit is a promise about a number, and the suite asserts it by counting:
the work records how many tasks are inside it at once, and the peak is exactly
the limit — never more, and not less either.

Without `concurrency` there is no limit. A limit that is not a positive integer
or `Infinity` throws [`FULCRO3012`](./errors/FULCRO3xxx.md#fulcro3012).

## Calling work off

A cancellation has two sides. The **source** calls work off and stays with
whoever started it; the **token** says whether the work has been called off,
and is what the work receives.

```ts
const source = createCancellationSource();

stopButton.onclick = () => source.cancel();

await using scope = createTaskScope({ token: source.token });
```

Every task's work is handed a token. It answers three questions:

```ts
scope.spawn(async (token) => {
	// For anything that accepts a signal — fetch, timers, streams, a worker pool.
	const response = await fetch(url, { signal: token.signal });

	for (const row of await response.json()) {
		// For a loop that never awaits, between steps.
		token.throwIfCancelled();
		handleRow(row);
	}
});
```

```ts
using registration = token.onCancelled((reason) => socket.close());
```

`token.signal` is an ordinary `AbortSignal`, the same state the token reads, so
the platform's own APIs take it with nothing to adapt. A handler registered
after the cancellation runs at once, so registering late never misses it.
Dispose the registration when the work no longer needs it: a long-lived token
otherwise keeps every handler ever registered on it.

`cancel(reason)` reports `reason`; `cancel()` reports an `AbortError`
`DOMException`, as an aborted signal does. Only the first call counts.

### Following a parent

```ts
using child = createCancellationSource(parentToken);
```

A source made under a parent token is cancelled when the parent is, with the
parent's reason — and starts cancelled if the parent already is. Disposing the
child stops it following: a parent that lives for the whole process would
otherwise hold every child made under it. A scope created with `token` follows
it the same way, and lets go of it as soon as the scope is joined or disposed.

## Failures

**The first task to fail calls every other task off.** The running ones are told
through their tokens, with that failure as the reason, and the waiting ones never
start. `join` rejects with that failure — the first one, not whatever the
cancelled tasks threw while answering the cancellation.

```ts
await using scope = createTaskScope();

scope.spawn(() => mustSucceed());
scope.spawn(() => mightFail());

await scope.join(); // rejects with the first failure
```

A task called off **on its own** is not a failure:

```ts
const preview = scope.spawn((token) => loadPreview(token.signal));

preview.cancel(); // the scope and the other tasks carry on
```

A waiting task called off never starts and gives its place up at once; a
running one is told through its token, and its rejection afterwards counts as a
cancellation. A scope called off with `scope.cancel(reason)`, or through its
parent token, rejects `join` with that reason.

### Reading one outcome as a value

```ts
const outcome = await task.settled;

outcome.handle({
	success: (value) => show(value),
	failure: (error) => showError(error),
});
```

`settled` never rejects: it is a [`Result`](./functions.md) holding the value,
or what the work threw, or the reason it was called off.

### Nothing fails in silence

A task nobody awaits does not become an unhandled rejection — on Node, that
would end the process. Its failure is held by the scope instead and reported by
`join`, or, if nobody joined, thrown when an `await using` scope ends. A failure
`join` already reported is not thrown a second time.

Work that rejects with `null` or `undefined` fails with
[`FULCRO3013`](./errors/FULCRO3xxx.md#fulcro3013) instead, the same error
object wherever it is reported — by the task, by `settled`, by `join`, to the
siblings as their reason, and by disposal. A nullish failure cannot be told
apart from no failure, so it is not passed on as one.

## The types

Every name a signature needs is exported as a type, for annotating your own
code:

| Type                 | What it is                                                           |
| -------------------- | -------------------------------------------------------------------- |
| `TaskScope`          | What `createTaskScope` returns                                       |
| `TaskScopeOptions`   | Its options: `concurrency` and `token`                               |
| `Task<T>`            | What `spawn` returns                                                 |
| `TaskWork<T>`        | What `spawn` takes: a function of the token, giving `T` or a promise |
| `CancellationSource` | What `createCancellationSource` returns                              |
| `CancellationToken`  | What work receives, and what a source or a scope follows             |

```ts
import type { CancellationToken } from '@fulcro/parallel';

const loadUserName = async (
	id: string,
	token: CancellationToken,
): Promise<string> => {
	const response = await fetch(`/users/${id}`, { signal: token.signal });

	return response.text();
};
```

## CPU work inside a task

A task that needs real computation hands it to a [worker pool](./parallelism.md)
and passes the pool its signal, so calling the task off stops the workers too:

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<Row, Parsed>({
	module: new URL('./parse.js', import.meta.url),
	export: 'parseRow',
});

await using scope = createTaskScope();

const parsed = scope.spawn(async (token) => {
	const rows = await download(url, token.signal);

	return pool.map(rows, { signal: token.signal });
});

await scope.join();
```

The task waits; the pool computes. Each does the one thing it is for.
