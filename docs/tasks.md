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

const fleet = scope.spawn((token) => loadFleetPositions(token.signal));
const roster = scope.spawn((token) => loadSquadronRoster(token.signal));

await scope.join();

brief(await fleet, await roster);
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

The briefing on Home One before Endor, assembled from two HoloNet requests that
wait together:

```ts
import { createTaskScope } from '@fulcro/parallel';

// A HoloNet request that answers after a delay, and stops if it is called off.
const holoNet = <T>(answer: T, milliseconds: number, signal: AbortSignal): Promise<T> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(answer), milliseconds);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

const loadFleetPositions = (signal: AbortSignal): Promise<string[]> => {
	return holoNet(['Home One', 'Liberty', 'Millennium Falcon'], 30, signal);
};

const loadSquadronRoster = (signal: AbortSignal): Promise<string[]> => {
	return holoNet(['Gold Leader', 'Red Leader', 'Green Leader'], 20, signal);
};

await using scope = createTaskScope();

const fleet = scope.spawn((token) => loadFleetPositions(token.signal));
const roster = scope.spawn((token) => loadSquadronRoster(token.signal));

await scope.join();

console.log(`${String((await fleet).length)} ships, led by ${(await roster).join(', ')}`);
// '3 ships, led by Gold Leader, Red Leader, Green Leader'

try {
	scope.spawn(() => 'a late arrival');
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO3011')); // true — a joined scope is closed
}
```

## How many run at once

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const outpost of outposts) {
	scope.spawn((token) => pollOutpost(outpost, token.signal));
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

The Imperial communications grid polling twelve outposts, never more than three
at a time — and counting to prove it:

```ts
import { createTaskScope } from '@fulcro/parallel';

const outposts = [
	'Hoth',
	'Scarif',
	'Jedha',
	'Lothal',
	'Kashyyyk',
	'Mustafar',
	'Eadu',
	'Coruscant',
	'Mimban',
	'Corellia',
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

console.log(reports.length); // 12
console.log(peak); // 3 — exactly the limit
```

## Calling work off

A cancellation has two sides. The **source** calls work off and stays with
whoever started it; the **token** says whether the work has been called off,
and is what the work receives.

```ts
const source = createCancellationSource();

abortMissionButton.onclick = () => source.cancel();

await using scope = createTaskScope({ token: source.token });
```

Every task's work is handed a token. It answers three questions:

```ts
scope.spawn(async (token) => {
	// For anything that accepts a signal — fetch, timers, streams, a worker pool.
	const response = await fetch(deathStarPlansUrl, { signal: token.signal });

	for (const schematic of await response.json()) {
		// For a loop that never awaits, between steps.
		token.throwIfCancelled();
		analyse(schematic);
	}
});
```

```ts
using registration = token.onCancelled((reason) => comlink.close());
```

`token.signal` is an ordinary `AbortSignal`, the same state the token reads, so
the platform's own APIs take it with nothing to adapt. A handler registered
after the cancellation runs at once, so registering late never misses it.
Dispose the registration when the work no longer needs it: a long-lived token
otherwise keeps every handler ever registered on it.

`cancel(reason)` reports `reason`; `cancel()` reports an `AbortError`
`DOMException`, as an aborted signal does. Only the first call counts.

The Rebels analysing the Death Star plans aboard Tantive IV when Vader's
Star Destroyer catches them — the source belongs to the bridge, and every task
hears the call through its token, in each of the three ways:

```ts
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';

const bridge = createCancellationSource();
const log: string[] = [];

const comlink = {
	open: true,
	close(): void {
		this.open = false;
	},
};

// Vader's ship closes in a little after the analysis starts.
setTimeout(() => bridge.cancel(new Error('Boarded by the Devastator')), 25);

const schematics = Array.from({ length: 1_000_000 }, (_, index) => `section ${String(index)}`);

try {
	await using scope = createTaskScope({ token: bridge.token });

	// 1. A signal, for anything that takes one.
	scope.spawn(async (token) => {
		await new Promise((resolve, reject) => {
			const relay = setTimeout(resolve, 1_000);

			token.signal.addEventListener(
				'abort',
				() => {
					clearTimeout(relay);
					reject(token.signal.reason);
				},
				{ once: true },
			);
		});

		log.push('plans relayed to Yavin');
	});

	// 2. Between the steps of a loop that does not await.
	scope.spawn(async (token) => {
		await new Promise((resolve) => setTimeout(resolve, 40));

		for (const schematic of schematics) {
			token.throwIfCancelled();
			log.push(`analysed ${schematic}`);
		}
	});

	// 3. A handler, for a resource that has to be released.
	scope.spawn((token) => {
		using registration = token.onCancelled(() => comlink.close());

		return new Promise((resolve) => setTimeout(resolve, 1_000));
	});

	await scope.join();
} catch (reason) {
	console.log((reason as Error).message); // 'Boarded by the Devastator'
}

console.log(log.length); // 0 — nothing was relayed, and no schematic analysed after the call
console.log(comlink.open); // false — the comlink was closed by the handler
console.log(bridge.token.isCancelled); // true
```

### Following a parent

```ts
using child = createCancellationSource(parentToken);
```

A source made under a parent token is cancelled when the parent is, with the
parent's reason — and starts cancelled if the parent already is. Disposing the
child stops it following: a parent that lives for the whole process would
otherwise hold every child made under it. A scope created with `token` follows
it the same way, and lets go of it as soon as the scope is joined or disposed.

The Rebel Alliance's high command and a single squadron's mission: calling off
the whole operation reaches the squadron, and a squadron that has already
landed no longer listens:

```ts
import { createCancellationSource } from '@fulcro/parallel';

const highCommand = createCancellationSource();

const goldSquadron = createCancellationSource(highCommand.token);
const roguesHome = createCancellationSource(highCommand.token);

roguesHome[Symbol.dispose](); // Rogue Squadron landed: it stops following high command

highCommand.cancel(new Error('The shield is still up — pull up!'));

console.log(goldSquadron.token.isCancelled); // true
console.log((goldSquadron.token.reason as Error).message); // 'The shield is still up — pull up!'
console.log(roguesHome.token.isCancelled); // false

const lateSquadron = createCancellationSource(highCommand.token);

console.log(lateSquadron.token.isCancelled); // true — born under a parent already called off
```

## Failures

**The first task to fail calls every other task off.** The running ones are told
through their tokens, with that failure as the reason, and the waiting ones never
start. `join` rejects with that failure — the first one, not whatever the
cancelled tasks threw while answering the cancellation.

```ts
await using scope = createTaskScope();

scope.spawn(() => holdTheTrench());
scope.spawn(() => targetTheExhaustPort());

await scope.join(); // rejects with the first failure
```

The trench run, where one ship's failure calls off the escort still flying:

```ts
import { createTaskScope } from '@fulcro/parallel';

let escortReason: unknown;

const holdTheTrench = (signal: AbortSignal): Promise<void> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, 1_000);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				escortReason = signal.reason;
				reject(new Error('Escort breaks off'));
			},
			{ once: true },
		);
	});
};

const targetTheExhaustPort = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 10));

	throw new Error('Gold Leader: the torpedoes impacted on the surface');
};

try {
	await using scope = createTaskScope();

	scope.spawn((token) => holdTheTrench(token.signal));
	scope.spawn(() => targetTheExhaustPort());

	await scope.join();
} catch (failure) {
	console.log((failure as Error).message); // 'Gold Leader: the torpedoes impacted on the surface' — the first failure
}

console.log((escortReason as Error).message); // 'Gold Leader: the torpedoes impacted on the surface' — the escort was told why
```

A task called off **on its own** is not a failure:

```ts
const preview = scope.spawn((token) => loadHologramPreview(token.signal));

preview.cancel(); // the scope and the other tasks carry on
```

A waiting task called off never starts and gives its place up at once; a
running one is told through its token, and its rejection afterwards counts as a
cancellation. A scope called off with `scope.cancel(reason)`, or through its
parent token, rejects `join` with that reason.

A holotable that drops a slow preview without abandoning the briefing:

```ts
import { createTaskScope } from '@fulcro/parallel';

const holoNet = <T>(answer: T, milliseconds: number, signal: AbortSignal): Promise<T> => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => resolve(answer), milliseconds);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

await using scope = createTaskScope();

const briefing = scope.spawn((token) =>
	holoNet('Attack the shield generator on Endor', 20, token.signal),
);
const preview = scope.spawn((token) =>
	holoNet('Rotating hologram of the second Death Star', 1_000, token.signal),
);

preview.cancel();

await scope.join(); // does not reject: a task called off on its own is not a failure

console.log(await briefing); // 'Attack the shield generator on Endor'
console.log((await preview.settled).isFailure()); // true — it holds the reason it was called off
```

### Reading one outcome as a value

```ts
const outcome = await task.settled;

outcome.handle({
	success: (value) => display(value),
	failure: (error) => displayError(error),
});
```

`settled` never rejects: it is a [`Result`](./functions.md) holding the value,
or what the work threw, or the reason it was called off.

Two sensor sweeps of the forest moon, each read as a value — one found the
bunker, one ran into the Ewoks:

```ts
import { createTaskScope } from '@fulcro/parallel';

const scope = createTaskScope();

const bunker = scope.spawn(async () => 'Back door of the shield bunker, guarded');

const ridge = scope.spawn(async () => {
	throw new Error('Sensor post taken by Ewoks');
});

const display = (task: typeof bunker): Promise<string> => {
	return task.settled.then((outcome) => {
		return outcome.handle({
			success: (value) => `Found: ${value}`,
			failure: (error) => `Lost: ${(error as Error).message}`,
		});
	});
};

console.log(await display(bunker)); // 'Found: Back door of the shield bunker, guarded'
console.log(await display(ridge)); // 'Lost: Sensor post taken by Ewoks'

await scope.join().catch(() => undefined); // the ridge's failure is the scope's to report too
```

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

A task nobody awaited, whose failure surfaces when the block ends:

```ts
import { createTaskScope } from '@fulcro/parallel';

try {
	await using scope = createTaskScope();

	scope.spawn(async () => {
		throw new Error('The reactor core of the second Death Star is unstable');
	});

	// The crew carries on with something else while the task runs and fails;
	// nobody awaits the task, and nobody joins.
	await new Promise((resolve) => setTimeout(resolve, 10));
} catch (failure) {
	console.log((failure as Error).message); // 'The reactor core of the second Death Star is unstable'
}
```

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

const loadPilotName = async (callSign: string, token: CancellationToken): Promise<string> => {
	const response = await fetch(`https://archives.rebellion.example/pilots/${callSign}`, {
		signal: token.signal,
	});

	return response.text();
};
```

A squadron service written against the types, so any scope or any token can be
handed to it:

```ts
import { createTaskScope } from '@fulcro/parallel';
import type { CancellationToken, Task, TaskScope, TaskWork } from '@fulcro/parallel';

const pilots = new Map([
	['Red Two', 'Wedge Antilles'],
	['Red Five', 'Luke Skywalker'],
]);

const loadPilotName = async (callSign: string, token: CancellationToken): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));
	token.throwIfCancelled();

	return pilots.get(callSign) ?? 'unknown pilot';
};

const nameOf =
	(callSign: string): TaskWork<string> =>
	(token) =>
		loadPilotName(callSign, token);

const loadRoster = (scope: TaskScope, callSigns: readonly string[]): Task<string>[] => {
	return callSigns.map((callSign) => scope.spawn(nameOf(callSign)));
};

await using scope = createTaskScope({ concurrency: 2 });

const roster = loadRoster(scope, ['Red Two', 'Red Five']);

await scope.join();

console.log(await Promise.all(roster)); // ['Wedge Antilles', 'Luke Skywalker']
```

## CPU work inside a task

A task that needs real computation hands it to a [worker pool](./parallelism.md)
and passes the pool its signal, so calling the task off stops the workers too:

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
});

await using scope = createTaskScope();

const decrypted = scope.spawn(async (token) => {
	const transmissions = await interceptTransmissions(token.signal);

	return pool.map(transmissions, { signal: token.signal });
});

await scope.join();
```

The task waits; the pool computes. Each does the one thing it is for.

The interception and the decryption as one task — waiting on the listening
post, then computing on the workers — with the task module from
[the parallelism guide](./parallelism.md#the-work-is-named-not-captured):

```js
// decrypt-task.mjs
export const decryptTransmission = ({ from, cipher }) => {
	let key = 0;

	for (let round = 0; round < 2_000_000; round++) key = (key * 31 + round) % 1_000_003;

	return `${from}: ${[...cipher].reverse().join('')} (key ${key})`;
};
```

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

interface Transmission {
	from: string;
	cipher: string;
}

const interceptTransmissions = async (signal: AbortSignal): Promise<Transmission[]> => {
	await new Promise((resolve) => setTimeout(resolve, 10));
	signal.throwIfAborted();

	return [
		{ from: 'Scarif', cipher: 'trop tsuahxe' },
		{ from: 'Eadu', cipher: 'osrE nelaG' },
	];
};

await using pool = createWorkerPool<Transmission, string>({
	module: new URL('./decrypt-task.mjs', import.meta.url),
	export: 'decryptTransmission',
	workers: 2,
});

await using scope = createTaskScope();

const decrypted = scope.spawn(async (token) => {
	const transmissions = await interceptTransmissions(token.signal);

	return pool.map(transmissions, { signal: token.signal });
});

await scope.join();

console.log(await decrypted); // ['Scarif: exhaust port (key 235197)', 'Eadu: Galen Erso (key 235197)']
```
