# @fulcro/parallel

Two tools, kept apart on purpose. A worker pool for work that is **not waiting
on anything** — parsing, hashing, compressing, transforming. And structured
tasks, with cancellation, for work that **waits**. Runs on the browser and on
Node.

```sh
npm install @fulcro/parallel
```

```ts
import { createWorkerPool } from '@fulcro/parallel';
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';
```

## Is this the tool you want?

Probably not, and that is worth settling before reading further.

| Your work                                | Reach for                                               |
| ---------------------------------------- | ------------------------------------------------------- |
| Waiting on a network, a disk, a database | [`selectAwait`](../collections/README.md) — concurrency |
| Several waiting jobs as one unit         | [Structured tasks](#structured-tasks)                   |
| Burning CPU: parsing, hashing, resizing  | This                                                    |

Threads do **nothing** for work that waits — there was never any idle time to
fill, and you have added the cost of copying data between realms to something
that was never the bottleneck. Concurrency and parallelism are different tools
for different problems.

## The work is named, not captured

This is the API's one constraint, and it is not arbitrary:

```ts
// Cannot work, and no library can make it work.
pool.map(transmissions, (transmission) => decryptTransmission(transmission));
```

A worker is a separate JavaScript realm. A function passed to one has to be
serialised, and **a closure's captured scope is not serialisable** —
`decryptTransmission` and everything it refers to exist only in the calling
realm. Libraries that appear to accept this either stringify the function and
lose its scope in silence, or re-import your whole module and hope it has no
side effects.

So you name a module export instead, which is a thing that genuinely crosses:

```js
// decrypt.js
export const decryptTransmission = ({ from, cipher }) =>
	`${from}: ${[...cipher].reverse().join('')}`;
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
const briefing = await pool.map(transmissions);

// As each one is done.
for await (const report of pool.stream(transmissions)) relayToHomeOne(report);
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
module above — `map` for the briefing in order, `stream` for each report as it
lands and into a sequence for the question the briefing needs answered:

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

const relayedToHomeOne: string[] = [];

for await (const report of pool.stream(intercepted)) relayedToHomeOne.push(report);

console.log(relayedToHomeOne.length); // 4

const aboutTheExhaustPort = await AsyncSequenceCollection.from(pool.stream(intercepted))
	.where((report) => report.includes('exhaust port'))
	.count();

console.log(aboutTheExhaustPort); // 2
```

## Close what you open

```ts
await pool.close();
```

A pool holds threads, and threads keep a Node process alive. Workers start on
the **first run** rather than at construction, so a pool nobody uses costs
nothing — but one that has run and not been closed will hang your process on
exit.

A closed pool stays closed. A run started afterwards, or one still waiting for
its turn when you closed, rejects with
[`FULCRO3010`](../../docs/errors/FULCRO3xxx.md#fulcro3010) and starts no thread.

Or let the scope close it, however the scope is left:

```ts
await using pool = createWorkerPool<Transmission, string>({
	module,
	export: 'decryptTransmission',
});
```

The codebreakers at Base One, closing their pool when the briefing is done — and
a late transmission that arrives after it:

```ts
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const module = new URL('./decrypt-task.mjs', import.meta.url);

const decryptWith = async (transmissions: Transmission[]): Promise<string[]> => {
	await using pool = createWorkerPool<Transmission, string>({
		module,
		export: 'decryptTransmission',
		workers: 1,
	});

	// Awaited here, so the pool is still open while it runs.
	return await pool.map(transmissions);
}; // the pool is closed here, however the block is left

console.log(await decryptWith([{ from: 'Eadu', cipher: 'osrE nelaG' }])); // ['Eadu: Galen Erso (key 235197)']

const pool = createWorkerPool<Transmission, string>({
	module,
	export: 'decryptTransmission',
	workers: 1,
});

await pool.close();

try {
	await pool.map([{ from: 'Scarif', cipher: 'trop tsuahxe' }]);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO3010')); // true — closed, and no thread started
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
await pool.map(holograms, {
	transfer: (hologram) => [hologram as ArrayBuffer],
});
```

For large binary payloads that is the difference between worthwhile and not.

Leia's hologram handed to R2-D2's worker rather than copied — the sender keeps
nothing:

```js
// hologram-task.mjs
export const measureHologram = (hologram) => hologram.byteLength;
```

```ts
import { createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<ArrayBuffer, number>({
	module: new URL('./hologram-task.mjs', import.meta.url),
	export: 'measureHologram',
	workers: 1,
});

const helpMeObiWan = new ArrayBuffer(1_024 * 1_024);

const sizes = await pool.map([helpMeObiWan], {
	transfer: (hologram) => [hologram as ArrayBuffer],
});

console.log(sizes); // [1048576] — the worker read every byte
console.log(helpMeObiWan.byteLength); // 0 — transferred, not copied
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

A run still waiting for its turn behind another rejects as soon as you abort,
and a `stream` stops its workers at the abort even while your loop is busy with
the last result.

The decryption called off when the Devastator boards the Tantive IV, on a pool
of four workers that takes the next batch as if nothing happened:

```ts
import { createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 4,
});

const boarded = new AbortController();

boarded.abort(new Error('Boarded by the Devastator'));

try {
	await pool.map([{ from: 'Scarif', cipher: 'trop tsuahxe' }], { signal: boarded.signal });
} catch (error) {
	console.log((error as Error).message); // 'Boarded by the Devastator'
}

const later = await pool.map([{ from: 'Jedha', cipher: 'latsyrc rebyk' }]);

console.log(later); // ['Jedha: kyber crystal (key 235197)']
```

## Failures

A task that throws rejects the run with its message. The error's _message_
crosses, not the error object: a custom error class loses its prototype in a
structured clone, and the message is what a caller reads anyway.

The first failure is the one you get, and it takes the rest of the run with it:
the elements still in flight are terminated with their workers, and the next run
starts a fresh set. A worker that dies between runs is replaced the same way.

A module that will not load, or an export that is not a function, rejects on the
first run rather than hanging.

## Structured tasks

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const outpost of outposts) {
	scope.spawn((token) => pollOutpost(outpost, token.signal));
}

await scope.join();
```

No task outlives its scope: `await using` waits for every task when the block
ends, calling off the ones still running. With `concurrency`, a task beyond the
limit waits without starting anything. The first task to fail calls
the others off and `join` rejects with it; `task.cancel()` calls one task off
without failing the rest. A failure nobody joined is thrown when the scope
ends, never lost.

`createCancellationSource(parent?)` is the cancellation behind it: the source
calls work off, the token tells the work, and `token.signal` is an ordinary
`AbortSignal` for `fetch`, timers and `pool.map`. Tasks run on the calling
thread, so they overlap waiting and never computing — that is what the pool is
for.

The types a signature needs — `TaskScope`, `TaskScopeOptions`, `Task<T>`,
`TaskWork<T>`, `CancellationSource`, `CancellationToken` — are exported for
annotating your own code. See [docs/tasks.md](../../docs/tasks.md).

Echo Base polling its outposts across the Outer Rim, never more than three at
once:

```ts
import { createTaskScope } from '@fulcro/parallel';

const outposts = [
	'Hoth',
	'Yavin 4',
	'Dantooine',
	'Crait',
	'Sullust',
	'Ord Mantell',
	'Bespin',
	'Tatooine',
];

let inFlight = 0;
let peak = 0;
const reports: string[] = [];

const pollOutpost = async (outpost: string, signal: AbortSignal): Promise<void> => {
	inFlight++;
	peak = Math.max(peak, inFlight);

	await new Promise((resolve) => setTimeout(resolve, 10));

	signal.throwIfAborted();
	reports.push(`${outpost}: all clear`);
	inFlight--;
};

await using scope = createTaskScope({ concurrency: 3 });

for (const outpost of outposts) {
	scope.spawn((token) => pollOutpost(outpost, token.signal));
}

await scope.join();

console.log(reports.length); // 8
console.log(peak); // 3 — exactly the limit
```

## Browser and Node

One implementation, two thin adapters. Almost everything this needs is a web
standard Node adopted — `navigator.hardwareConcurrency`, structured clone,
`AbortSignal`, `new URL(…, import.meta.url)`. Only worker construction and
message reading differ, and the `exports` map picks between them, so a browser
bundle never contains a reference to `node:worker_threads`.

**This package is ESM only.** `import.meta.url` is what locates the worker
script portably, and it does not exist in CommonJS.

---

**Full guides:** [docs/parallelism.md](../../docs/parallelism.md) and
[docs/tasks.md](../../docs/tasks.md) — scenarios, worked examples and the
failure modes worth knowing before you meet them.
🇧🇷 Leia em português: [paralelismo](../../docs/pt-BR/parallelism.md) e
[tasks estruturadas](../../docs/pt-BR/tasks.md).
