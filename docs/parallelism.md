# Parallelism with workers

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/parallelism.md)

A worker pool for work that is **not waiting on anything** — parsing, hashing,
compressing, transforming. Runs on the browser and on Node.

```sh
npm install @fulcro/parallel
```

```ts
import { createWorkerPool } from '@fulcro/parallel';
```

## Is this the tool you want?

Probably not, and that is worth settling before reading further.

| Your work                                | Reach for                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| Waiting on a network, a disk, a database | [`selectAwait`](./concurrency.md) — bounded concurrency |
| Several waiting jobs as one unit         | [Structured tasks](./tasks.md)                          |
| Burning CPU: parsing, hashing, resizing  | This                                                    |

Threads do **nothing** for work that waits — there was never any idle time to
fill, and you have added the cost of copying data between realms to something
that was never the bottleneck. Concurrency and parallelism are different tools
for different problems.

## The work is named, not captured

This is the API's one constraint, and it is not arbitrary:

```ts
// Cannot work, and no library can make it work.
pool.map(transmissions, (transmission) => crackImperialCipher(transmission));
```

A worker is a separate JavaScript realm. A function passed to one has to be
serialised, and **a closure's captured scope is not serialisable** —
`crackImperialCipher` and everything it refers to exist only in the calling
realm. Libraries that appear to accept this either stringify the function and
lose its scope in silence, or re-import your whole module and hope it has no
side effects.

So you name a module export instead, which is a thing that genuinely crosses:

```ts
// decrypt.js
export const decryptTransmission = (transmission) => crackImperialCipher(transmission.cipher);
```

```ts
const pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt.js', import.meta.url),
	export: 'decryptTransmission',
});

const decrypted = await pool.map(transmissions);

await pool.close();
```

`new URL(…, import.meta.url)` is also the form Vite, Rollup, webpack and esbuild
all recognise as a worker entry and rewrite to the emitted asset. A bare string
path works on Node and breaks the moment a browser build moves a file.

The whole of it — the task module the workers load, and the code that hands it
the transmissions Rebel spies intercepted on the way to Scarif. The key schedule
is deliberately heavy: that is the part worth a thread.

```js
// decrypt-task.mjs
// Loaded inside each worker. Everything the task needs lives in this module;
// nothing is captured from the code that starts the pool.
export const decryptTransmission = ({ from, cipher }) => {
	let key = 0;

	for (let round = 0; round < 2_000_000; round++) key = (key * 31 + round) % 1_000_003;

	return `${from}: ${[...cipher].reverse().join('')} (key ${key})`;
};
```

```ts
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const intercepted: Transmission[] = [
	{ from: 'Scarif', cipher: 'trop tsuahxe' },
	{ from: 'Jedha', cipher: 'latsyrc rebyk' },
	{ from: 'Eadu', cipher: 'osrE nelaG' },
];

const pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 2,
});

const decrypted = await pool.map(intercepted);

await pool.close();

console.log(decrypted);
// [
//   'Scarif: exhaust port (key 235197)',
//   'Jedha: kyber crystal (key 235197)',
//   'Eadu: Galen Erso (key 235197)',
// ]
```

## Reading the results

```ts
// In input order, whatever order the workers finished in.
const results = await pool.map(transmissions);

// As each one is done.
for await (const result of pool.stream(transmissions)) relayToHomeOne(result);
```

`stream` is a plain `AsyncIterable`, so it drops straight into the sequences
without this package depending on them:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const aboutTheDeathStar = await AsyncSequenceCollection.from(pool.stream(transmissions))
	.where((report) => report.includes('exhaust port'))
	.count();
```

Both readings over the same intercepted traffic, with the `decrypt-task.mjs`
module above — `map` for the briefing in order, `stream` into a sequence for
the question the briefing needs answered:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const intercepted: Transmission[] = [
	{ from: 'Scarif', cipher: 'trop tsuahxe' },
	{ from: 'Jedha', cipher: 'latsyrc rebyk' },
	{ from: 'Eadu', cipher: 'osrE nelaG' },
	{ from: 'Scarif', cipher: 'trop tsuahxe' },
];

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 2,
});

const briefing = await pool.map(intercepted);

console.log(briefing.map((line) => line.split(':')[0])); // ['Scarif', 'Jedha', 'Eadu', 'Scarif'] — input order

const aboutTheExhaustPort = await AsyncSequenceCollection.from(pool.stream(intercepted))
	.where((report) => report.includes('exhaust port'))
	.count();

console.log(aboutTheExhaustPort); // 2
```

## One batch at a time

A pool runs one batch at a time. Start a second `map` or `stream` while one is
still going and it waits for it rather than sharing the workers:

```ts
const [rebel, imperial] = await Promise.all([
	pool.map(rebelTraffic), // runs now
	pool.map(imperialTraffic), // runs when the first has finished
]);
```

Both are correct, and neither exceeds `workers`. The alternative — sharing the
threads between two runs — would need a run identity in every message to route
the replies back, and buys nothing: one run already saturates the workers.

The consequence worth knowing is that a `stream` holds the pool for as long as
you read it. Finish it, or `break` out of the `for await`, before starting
another run. A `for await` hands the pool back on `break` and on a throw; an
iterator you take by hand has to be finished or given its `return()`, or it
holds the pool for good.

`map` and `stream` also read the elements you hand them **in full** before
dispatching any, so a generator of ten million rows becomes ten million rows in
memory. Batch it yourself if that matters.

Rebel and Imperial traffic decrypted on one pool, the second batch queued behind
the first, with the same `decrypt-task.mjs`:

```ts
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const rebelTraffic: Transmission[] = [{ from: 'Yavin 4', cipher: 'selbmessa teelf lebeR' }];
const imperialTraffic: Transmission[] = [{ from: 'Coruscant', cipher: '66 redrO' }];

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 2,
});

const [rebel, imperial] = await Promise.all([pool.map(rebelTraffic), pool.map(imperialTraffic)]);

console.log(rebel); // ['Yavin 4: Rebel fleet assembles (key 235197)']
console.log(imperial); // ['Coruscant: Order 66 (key 235197)']
```

## Close what you open

```ts
await pool.close();
```

A pool holds threads, and threads keep a Node process alive. Workers start on
the **first run** rather than at construction, so a pool nobody uses costs
nothing — but one that has run and not been closed will hang your process on
exit.

Declared with `await using`, a pool closes when its scope ends, however the
scope is left — a throw included:

```ts
{
	await using pool = createWorkerPool<Transmission, string>({
		module: new URL('./decrypt-task.mjs', import.meta.url),
		export: 'decryptTransmission',
	});

	const decrypted = await pool.map(transmissions);
} // every worker is stopped here
```

Closing a pool already closed does nothing, so calling `close()` inside the
scope as well is harmless. `await using` needs TypeScript 5.2 or later, with
`esnext.disposable` in `lib` or `@types/node` installed.

A closed pool stays closed. A run started afterwards, or one still waiting for
its turn when you closed, rejects with
[`FULCRO3010`](./errors/FULCRO3xxx.md#fulcro3010) and starts no thread — so a
shutdown handler that closes the pool cannot be undone by a request that
arrived just before it. `close()` settles once every worker is gone, including
those a run you called off is still stopping.

A Rebel listening post shutting down as the Empire closes in — the pool is
closed by its scope, and a late request after the shutdown is refused:

```ts
import { createWorkerPool, type WorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

let listeningPost: WorkerPool<Transmission, string> | undefined;

{
	await using pool = createWorkerPool<Transmission, string>({
		module: new URL('./decrypt-task.mjs', import.meta.url),
		export: 'decryptTransmission',
		workers: 1,
	});

	listeningPost = pool;

	console.log(await pool.map([{ from: 'Hoth', cipher: 'gnimoc era sreklaw' }]));
	// ['Hoth: walkers are coming (key 235197)']

	await pool.close(); // harmless: the scope will close it again
} // the workers are stopped here

try {
	await listeningPost.map([{ from: 'Hoth', cipher: 'etal oot' }]);
} catch (error) {
	console.log((error as Error).message); // 'FULCRO3010: The pool was closed, and a closed pool runs nothing.'
}
```

## What crossing a thread costs

Every value is **structure-cloned** in both directions: a real copy,
proportional to size. That allows plain objects, arrays, typed arrays, `Map`,
`Set` and `Date`, and rules out functions, class instances with behaviour, and
anything holding a reference to the outside world.

An `ArrayBuffer` can be _transferred_ instead — ownership moves, nothing is
copied, and the sending side can no longer read it:

```ts
await pool.map(thermalScans, {
	transfer: (scan) => [scan as ArrayBuffer],
});
```

For large binary payloads that is the difference between worthwhile and not.

Thermal scans of Hoth's surface, handed to the workers without a copy — and the
scan the base no longer holds once it has:

```js
// thermal-task.mjs
// Counts the readings hot enough to be a living thing under the snow.
export const countHotspots = (scan) => {
	let hotspots = 0;

	for (const reading of new Uint8Array(scan)) if (reading > 200) hotspots++;

	return hotspots;
};
```

```ts
import { createWorkerPool } from '@fulcro/parallel';

const scanOf = (readings: number[]): ArrayBuffer => new Uint8Array(readings).buffer;

const northRidge = scanOf([12, 250, 201, 3, 255]); // a tauntaun, a wampa and Luke
const shieldGenerator = scanOf([90, 110, 40]);

await using pool = createWorkerPool<ArrayBuffer, number>({
	module: new URL('./thermal-task.mjs', import.meta.url),
	export: 'countHotspots',
	workers: 2,
});

const hotspots = await pool.map([northRidge, shieldGenerator], {
	transfer: (scan) => [scan as ArrayBuffer],
});

console.log(hotspots); // [3, 0]
console.log(northRidge.byteLength); // 0 — transferred: the bytes now belong to the worker that read them
```

### There is a threshold, and below it this is slower

Starting threads is expensive, and copying data is expensive. Below some amount
of work per element, both cost more than the parallelism saves. The suite
asserts this in both directions rather than leaving you to find out — that four
workers beat one on genuinely heavy work, _and_ that a cold pool loses to a warm
one on trivial work.

Two practical consequences:

- **Reuse the pool.** Create it once, run many batches through it. Paying thread
  startup per batch is how a speed-up becomes a slowdown.
- **Measure.** If your elements are small and your function is quick, an
  ordinary loop will win.

## Workers

```ts
createWorkerPool({ module, export: 'decryptTransmission', workers: 4 });
```

Defaults to `navigator.hardwareConcurrency` — a web standard both the browser
and Node report — and to `4` where neither does. More workers than cores does
not help work that is already CPU-bound; it only adds scheduling.

A cryptography console that leaves one core to the interface the officer is
typing into, and gives the rest to the cipher:

```ts
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const workers = Math.max(1, navigator.hardwareConcurrency - 1);

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers,
});

const decrypted = await pool.map([
	{ from: 'Bespin', cipher: "part a s'tI" },
	{ from: 'Endor', cipher: "part a s'tI" },
]);

console.log(decrypted.length); // 2 — on as many threads as the machine can spare
```

## Cancelling

```ts
const controller = new AbortController();

await pool.map(transmissions, { signal: controller.signal });
```

Unlike a promise, a worker genuinely **can** be stopped — but only by being
terminated, not interrupted. So a worker holding an element when you abort is
killed, that element produces no result, and the pool discards itself rather
than handing the next run a thread still busy with something nobody is waiting
for. The next run builds a fresh one.

That happens when you abort, not when the current element happens to finish:
the run rejects straight away, even with every worker mid-task. Abort before a
run has handed anything out and no element is dispatched at all — the workers
are not even started.

The same holds in the two places where nothing is waiting on the workers:

- **A run queued behind another** rejects as soon as you abort, rather than
  when the run ahead of it finishes, and gives its place up without letting the
  runs behind it overtake.
- **A `stream` whose loop is busy** with the last result has its workers
  stopped at the abort, not on the next pull — which may never come. The
  rejection reaches you on that next pull.

A [task](./tasks.md) drives a pool the same way, with `token.signal`, so
calling the task off stops the workers too.

The siege of a shield wall that would take five seconds a section, called off
a tenth of a second in — and the run rejects then, not when the workers would
have finished:

```js
// siege-task.mjs
// Five seconds of uninterruptible work per section of wall.
export const besiege = (section) => {
	const until = Date.now() + 5_000;

	while (Date.now() < until);

	return `${section} breached`;
};
```

```ts
import { createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<string, string>({
	module: new URL('./siege-task.mjs', import.meta.url),
	export: 'besiege',
	workers: 2,
});

const retreat = new AbortController();

setTimeout(() => retreat.abort(new Error('Fall back to the transports!')), 100);

const startedAt = Date.now();

try {
	await pool.map(['north wall', 'east wall'], { signal: retreat.signal });
} catch (reason) {
	console.log((reason as Error).message); // 'Fall back to the transports!'
}

console.log(Date.now() - startedAt < 1_000); // true — the busy workers were terminated, not waited for
```

## Failures

A task that throws rejects the run with its message. The error's _message_
crosses, not the error object: a custom error class loses its prototype in a
structured clone, and the message is what a caller reads anyway.

The first failure is the one you get, and it takes the rest of the run with it.
A worker cannot be interrupted, only terminated, so the elements still in flight
are terminated with their workers and produce no result, and later failures in
the same run are not reported. The next run starts a fresh set of workers.

A worker can also die while no run is using it — a timer or a promise a task
left behind throws after the run has finished, or the thread runs out of memory.
The pool keeps listening to every worker for its whole life, so this neither
escapes as an uncaught exception nor reaches the next run: that run starts a
fresh set instead of handing an element to a thread that is gone.

A module that will not load, or an export that is not a function, rejects on the
first run rather than hanging.

## Browser and Node

One implementation, two thin adapters. Almost everything this needs is a web
standard Node adopted — `navigator.hardwareConcurrency`, structured clone,
`AbortSignal`, `new URL(…, import.meta.url)`. Only worker construction and
message reading differ, and the `exports` map picks between them, so a browser
bundle never contains a reference to `node:worker_threads`.

**This package is ESM only.** `import.meta.url` is what locates the worker
script portably, and it does not exist in CommonJS.
