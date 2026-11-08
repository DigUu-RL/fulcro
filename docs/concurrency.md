# Bounded concurrency

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/concurrency.md)

Running several elements at once instead of one at a time — for work that spends
its time waiting.

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Part of [async sequences](./async-sequences.md); read that first if you have not.

## The problem it solves

This loads a hundred records from the Jedi Archives one after another. If each
request takes 100 ms, it takes ten seconds:

```ts
const records = await AsyncSequenceCollection.from(names).select(loadJediRecord).toArray();
```

This loads eight at a time, and takes a little over one second:

```ts
const records = await AsyncSequenceCollection.from(names)
	.selectAwait(loadJediRecord, { concurrency: 8 })
	.toArray();
```

Nothing runs _at the same instant_ — JavaScript is one thread. What overlaps is
the **waiting**. While one request is in the air, the others can be too.

**This does nothing for work that is not waiting.** Parsing, hashing, resizing —
anything CPU-bound — gets no faster, because there was never any idle time to
fill. That needs real parallelism, which is a different tool.

Both, against an archive that records how many requests it is serving at once:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface JediRecord {
	name: string;
	homeworld: string;
}

const homeworlds = new Map([
	['Yoda', 'unknown'],
	['Mace Windu', 'Haruun Kal'],
	['Obi-Wan Kenobi', 'Stewjon'],
	['Ki-Adi-Mundi', 'Cerea'],
	['Plo Koon', 'Dorin'],
	['Kit Fisto', 'Glee Anselm'],
	['Shaak Ti', 'Shili'],
	['Aayla Secura', 'Ryloth'],
]);

let inFlight = 0;
let peak = 0;

const loadJediRecord = async (name: string): Promise<JediRecord> => {
	inFlight++;
	peak = Math.max(peak, inFlight);

	await new Promise((resolve) => setTimeout(resolve, 100));

	inFlight--;

	return { name, homeworld: homeworlds.get(name) ?? 'unknown' };
};

const names = [...homeworlds.keys()];

await AsyncSequenceCollection.from(names).select(loadJediRecord).toArray();

console.log(peak); // 1 — eight requests, one after another

peak = 0;

const records = await AsyncSequenceCollection.from(names)
	.selectAwait(loadJediRecord, { concurrency: 4 })
	.toArray();

console.log(peak); // 4 — the waiting overlapped, and never more than four at once
console.log(records[2]); // { name: 'Obi-Wan Kenobi', homeworld: 'Stewjon' } — in input order
```

## The operators

```ts
// Project several at a time.
.selectAwait(loadJediRecord, { concurrency: 8 })

// Filter with a condition that has to ask something.
.whereAwait(async (designation) => hasClearance(designation), { concurrency: 8 })

// Project and filter at once, dropping what came back empty.
.chooseAwait((designation) => findPost(designation), { concurrency: 8 })

// Rank by a key that has to be fetched.
.topByAwait((designation) => fetchMarksmanship(designation), 10, { concurrency: 8 })

// Do something for its effects, with no result collected.
await troopers.forEachAwait((designation) => imperialRecords.file(designation), { concurrency: 4 });
```

The `Await` suffix is the marker: `select` awaits one element before pulling the
next, `selectAwait` keeps several in flight. Operators without it need no
decision from you, and that is the point of keeping them separate.

All four, on a garrison of stormtroopers whose files live on a slow Imperial
network:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const network = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const garrison = ['TK-421', 'TK-422', 'FN-2187', 'TK-9091', 'TK-0117'];

const clearance = new Set(['FN-2187', 'TK-0117']);
const posts = new Map([
	['TK-421', 'Docking Bay 327'],
	['FN-2187', 'Starkiller Base sanitation'],
]);
const marksmanship = new Map([
	['TK-421', 12],
	['TK-422', 31],
	['FN-2187', 88],
	['TK-9091', 7],
	['TK-0117', 64],
]);

const hasClearance = async (designation: string): Promise<boolean> => {
	await network(10);

	return clearance.has(designation);
};

const findPost = async (designation: string): Promise<string | null> => {
	await network(10);

	return posts.get(designation) ?? null;
};

const fetchMarksmanship = async (designation: string): Promise<number> => {
	await network(10);

	return marksmanship.get(designation) ?? 0;
};

const filed: string[] = [];

const imperialRecords = {
	file: async (designation: string): Promise<void> => {
		await network(5);
		filed.push(designation);
	},
};

const troopers = AsyncSequenceCollection.from(garrison);

console.log(
	await troopers
		.whereAwait(async (designation) => hasClearance(designation), { concurrency: 3 })
		.toArray(),
);
// ['FN-2187', 'TK-0117']

console.log(
	await troopers.chooseAwait((designation) => findPost(designation), { concurrency: 3 }).toArray(),
);
// ['Docking Bay 327', 'Starkiller Base sanitation']

console.log(
	await troopers
		.topByAwait((designation) => fetchMarksmanship(designation), 2, { concurrency: 3 })
		.toArray(),
);
// ['FN-2187', 'TK-0117'] — the only two who could hit anything

await troopers.forEachAwait((designation) => imperialRecords.file(designation), { concurrency: 2 });

console.log(filed.length); // 5
```

## `concurrency` is required, and that is deliberate

There is no default, and the type will not let you omit it:

```ts
.selectAwait(loadJediRecord, { concurrency: 8 }) // ✓
.selectAwait(loadJediRecord)                     // ✗ does not compile
```

No default could be right:

- **Unbounded** is how rate limits get hit and file descriptors run out — and it
  works fine in development, where the input is small, then fails in production.
- **`1`** would make the operator pointless.
- **Anything in between** is a guess about a service only you know.

A limit that is not a positive integer is rejected **where you wrote it**, not
later when the sequence runs:

```ts
.selectAwait(loadJediRecord, { concurrency: 0 })
// Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

A limit read from configuration, refused the moment the chain is built — before
a single record is requested:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

let requests = 0;

const loadJediRecord = async (name: string): Promise<string> => {
	requests++;
	await new Promise((resolve) => setTimeout(resolve, 10));

	return `${name}: record restored`;
};

// A setting someone left at zero after the purge.
const archiveSettings = { parallelDownloads: 0 };

try {
	AsyncSequenceCollection.from(['Yoda', 'Kenobi']).selectAwait(loadJediRecord, {
		concurrency: archiveSettings.parallelDownloads,
	});
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.'
}

console.log(requests); // 0
```

### Picking a number

There is no universal answer, but there are useful anchors:

| Work                              | Reasonable starting point                      |
| --------------------------------- | ---------------------------------------------- |
| An API you do not control         | Whatever its rate limit allows, minus headroom |
| An API you do control             | 10–50                                          |
| A database with a connection pool | At most the pool size                          |
| Reading many files                | 10–100                                         |

If the thing you are calling has a documented limit, that is your ceiling. If it
does not, start low and raise it while watching for errors.

## Order

Results come back **in input order by default**:

```ts
const arrivals = await AsyncSequenceCollection.from(['Millennium Falcon', 'Ghost', 'Razor Crest'])
	.selectAwait(jumpToLightspeed, { concurrency: 3 })
	.toArray();
// ['Millennium Falcon', 'Ghost', 'Razor Crest'] — whatever order they arrived in
```

That is the behaviour that composes: an operator in the middle of a chain should
not quietly change what a later `zip` or `pairwise` is pairing. A slow element
holds back the ones behind it, though they still _ran_ concurrently — the
waiting is overlapped either way.

Ask for completion order when you want each result as soon as it exists:

```ts
.selectAwait(jumpToLightspeed, { concurrency: 8, ordered: false })
```

Useful when you are rendering results as they arrive, or writing them somewhere
that does not care about order. Not useful when the position carries meaning.

Three ships jumping at once, their arrivals listed both ways:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const jumpSeconds = new Map([
	['Millennium Falcon', 10],
	['Ghost', 60],
	['Razor Crest', 30],
]);

const jumpToLightspeed = async (ship: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, jumpSeconds.get(ship)));

	return ship;
};

const fleet = AsyncSequenceCollection.from([...jumpSeconds.keys()]);

console.log(await fleet.selectAwait(jumpToLightspeed, { concurrency: 3 }).toArray());
// ['Millennium Falcon', 'Ghost', 'Razor Crest'] — the order they were sent

console.log(
	await fleet.selectAwait(jumpToLightspeed, { concurrency: 3, ordered: false }).toArray(),
);
// ['Millennium Falcon', 'Razor Crest', 'Ghost'] — the order they arrived
```

## When something fails

The sequence rejects with the first error, and:

1. **No further work is started.**
2. **Work already in flight is awaited** before the rejection reaches you.

That second point is not politeness — it is what stops a rejection from a task
nobody is waiting on any more from surfacing later as an unhandled rejection and
crashing the process.

```ts
try {
	await council.selectAwait(loadJediRecord, { concurrency: 8 }).toArray();
} catch (error) {
	// The first failure. Anything else in flight has finished and been discarded.
}
```

The Council's records, with one member who has left the Order — the failure
stops new work, and waits for the requests already out:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const started: string[] = [];
const finished: string[] = [];

const loadJediRecord = async (name: string): Promise<string> => {
	started.push(name);

	await new Promise((resolve) => setTimeout(resolve, name === 'Dooku' ? 10 : 30));

	if (name === 'Dooku') throw new Error('Dooku has left the Jedi Order');

	finished.push(name);

	return `${name}: record restored`;
};

const council = AsyncSequenceCollection.from([
	'Yoda',
	'Dooku',
	'Mace Windu',
	'Plo Koon',
	'Kit Fisto',
]);

try {
	await council.selectAwait(loadJediRecord, { concurrency: 3 }).toArray();
} catch (error) {
	console.log((error as Error).message); // 'Dooku has left the Jedi Order'
}

console.log(started); // ['Yoda', 'Dooku', 'Mace Windu'] — nothing started after the failure
console.log(finished); // ['Yoda', 'Mace Windu'] — the two in flight finished before the rejection arrived
```

### Collecting failures instead of stopping

There is no `settled: true` flag, because you can already express it — and the
composition reads better than a flag would:

```ts
const outcomes = await AsyncSequenceCollection.from(planets)
	.selectAwait((planet) => tryCatch(() => decodeCoordinates(planet)), { concurrency: 8 })
	.toArray();

const [decoded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

Every element is attempted, nothing stops early, and you get both halves.

Decoding the coordinates of every planet in a stolen star chart — one of them
has been erased from the archives, and the rest are decoded anyway:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { tryCatch } from '@fulcro/functions';

const decodeCoordinates = async (planet: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	if (planet === 'Kamino') throw new Error('Kamino is not in the archives');

	return `${planet}: coordinates decoded`;
};

const planets = ['Hoth', 'Dagobah', 'Kamino', 'Bespin'];

const outcomes = await AsyncSequenceCollection.from(planets)
	.selectAwait((planet) => tryCatch(() => decodeCoordinates(planet)), { concurrency: 2 })
	.toArray();

const [decoded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);

console.log(decoded.select((outcome) => outcome.value).toArray());
// ['Hoth: coordinates decoded', 'Dagobah: coordinates decoded', 'Bespin: coordinates decoded']

console.log(failed.select((outcome) => (outcome.error as Error).message).toArray());
// ['Kamino is not in the archives'] — "If an item does not appear in our records, it does not exist."
```

## Cancelling

The signal goes on the terminal, as it does everywhere else:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(holocrons)
	.selectAwait(downloadHolocron, { concurrency: 8 })
	.toArray({ signal: controller.signal });
```

Aborting stops new work and rejects. It does **not** kill the eight requests
already in the air — a promise has no cancel. To stop those too, hand the same
signal to the work itself:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(holocrons)
	.selectAwait((name) => downloadHolocron(name, controller.signal), {
		concurrency: 8,
	})
	.toArray({ signal: controller.signal });
```

The Temple's holocrons being copied out as the clones march in — the signal
stops the downloads that started, and the rest never start:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const started: string[] = [];

const downloadHolocron = (name: string, signal: AbortSignal): Promise<string> => {
	started.push(name);

	return new Promise((resolve, reject) => {
		const transfer = setTimeout(() => resolve(`${name}: copied`), 1_000);

		signal.addEventListener(
			'abort',
			() => {
				clearTimeout(transfer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});
};

const holocrons = [
	'Sith Holocron',
	'Kyber Archive',
	'Temple Map',
	'Order of Succession',
	'Youngling Registry',
];

const controller = new AbortController();

setTimeout(() => controller.abort(new Error('Operation: Knightfall has begun')), 30);

try {
	await AsyncSequenceCollection.from(holocrons)
		.selectAwait((name) => downloadHolocron(name, controller.signal), { concurrency: 2 })
		.toArray({ signal: controller.signal });
} catch (reason) {
	console.log((reason as Error).message); // 'Operation: Knightfall has begun'
}

console.log(started); // ['Sith Holocron', 'Kyber Archive'] — the other three never started
```

## What you give up

The rest of `AsyncSequence` has **back pressure**: one element is pulled,
processed, and only then is the next asked for. The concurrent operators
deliberately break that — up to `concurrency` elements are pulled before any
result comes back.

That is the trade. It is the right one when the elements are cheap and the work
on them is slow, which is the case these operators exist for. It is the wrong
one if pulling the elements is itself expensive or the source must not run
ahead.

## Real scenarios

### Enriching a list from an API

```ts
const enriched = await AsyncSequenceCollection.from(jobs)
	.selectAwait(async (job) => ({ ...job, standing: await loadGuildStanding(job.hunter) }), {
		concurrency: 10,
	})
	.toArray();
```

The Guild's job board, each job joined with its hunter's standing from a remote
registry:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Job {
	target: string;
	hunter: string;
}

const standings = new Map([
	['Boba Fett', 'legendary'],
	['Din Djarin', 'trusted'],
	['Bossk', 'reliable'],
]);

const loadGuildStanding = async (hunter: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 20));

	return standings.get(hunter) ?? 'unlisted';
};

const jobs: Job[] = [
	{ target: 'Han Solo', hunter: 'Boba Fett' },
	{ target: 'Grogu', hunter: 'Din Djarin' },
	{ target: 'Chewbacca', hunter: 'Bossk' },
	{ target: 'Mythrol', hunter: 'Din Djarin' },
];

const enriched = await AsyncSequenceCollection.from(jobs)
	.selectAwait(async (job) => ({ ...job, standing: await loadGuildStanding(job.hunter) }), {
		concurrency: 10,
	})
	.toArray();

console.log(enriched[0]); // { target: 'Han Solo', hunter: 'Boba Fett', standing: 'legendary' }
console.log(enriched.map((job) => job.standing)); // ['legendary', 'trusted', 'reliable', 'trusted']
```

### Writing batches, several at a time

```ts
await AsyncSequenceCollection.from(streamManifests())
	.chunk(500)
	.forEachAwait((batch) => imperialDatabase.insertMany(batch), { concurrency: 4 });
```

Four inserts of five hundred rows in flight, and the stream never gets more than
four batches ahead.

A day of cargo manifests from the Kuat shipyards, written in batches with two
inserts allowed in flight:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

let inFlight = 0;
let peak = 0;
const written: number[] = [];

const imperialDatabase = {
	insertMany: async (batch: readonly string[]): Promise<void> => {
		inFlight++;
		peak = Math.max(peak, inFlight);

		await new Promise((resolve) => setTimeout(resolve, 20));

		written.push(batch.length);
		inFlight--;
	},
};

const streamManifests = async function* (): AsyncGenerator<string> {
	for (let hull = 1; hull <= 1_800; hull++) yield `Star Destroyer hull ${String(hull)}`;
};

await AsyncSequenceCollection.from(streamManifests())
	.chunk(500)
	.forEachAwait((batch) => imperialDatabase.insertMany(batch), { concurrency: 2 });

console.log(written.length); // 4 — batches of 500, 500, 500 and 300
console.log(peak); // 2 — never more inserts at once than the limit
```

### Checking permissions before acting

```ts
const allowed = await AsyncSequenceCollection.from(holocrons)
	.whereAwait((holocron) => canRead(padawan, holocron), { concurrency: 20 })
	.toArray();
```

A Padawan at the Archives, shown only what the access service allows:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Holocron {
	title: string;
	restricted: boolean;
}

interface Reader {
	name: string;
	rank: 'Padawan' | 'Knight' | 'Master';
}

const canRead = async (reader: Reader, holocron: Holocron): Promise<boolean> => {
	await new Promise((resolve) => setTimeout(resolve, 10));

	return !holocron.restricted || reader.rank === 'Master';
};

const padawan: Reader = { name: 'Ahsoka Tano', rank: 'Padawan' };

const holocrons: Holocron[] = [
	{ title: 'Lightsaber forms', restricted: false },
	{ title: 'The Sith Code', restricted: true },
	{ title: 'History of the Old Republic', restricted: false },
];

const allowed = await AsyncSequenceCollection.from(holocrons)
	.whereAwait((holocron) => canRead(padawan, holocron), { concurrency: 20 })
	.select((holocron) => holocron.title)
	.toArray();

console.log(allowed); // ['Lightsaber forms', 'History of the Old Republic']
```

### Rendering results as they arrive

```ts
const results = AsyncSequenceCollection.from(sectors).selectAwait(searchStarCharts, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);
```

Searching the star charts for Kamino, sector by sector, each answer shown the
moment it comes back:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const searchTime = new Map([
	['Rishi Maze', 40],
	['Abrion sector', 10],
	['Outer Rim', 25],
]);

const searchStarCharts = async (sector: string): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, searchTime.get(sector)));

	return sector === 'Rishi Maze'
		? `${sector}: a gap where a planet should be`
		: `${sector}: nothing`;
};

const screen: string[] = [];

const render = (result: string): void => {
	screen.push(result);
};

const results = AsyncSequenceCollection.from([...searchTime.keys()]).selectAwait(searchStarCharts, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);

console.log(screen);
// ['Abrion sector: nothing', 'Outer Rim: nothing', 'Rishi Maze: a gap where a planet should be']
```

## Reference

| Operator                                  | Returns                         | Options                            |
| ----------------------------------------- | ------------------------------- | ---------------------------------- |
| `selectAwait(selector, options)`          | `AsyncSequence<R>`              | `concurrency`, `ordered`           |
| `whereAwait(predicate, options)`          | `AsyncSequence<T>`              | `concurrency`, `ordered`           |
| `chooseAwait(selector, options)`          | `AsyncSequence<NonNullable<R>>` | `concurrency`, `ordered`           |
| `topByAwait(keySelector, count, options)` | `AsyncSequence<T>`              | `concurrency`                      |
| `forEachAwait(action, options)`           | `Promise<void>`                 | `concurrency`, `ordered`, `signal` |

`forEachAwait` hands the action the position of the element **in the source**,
not the order the actions happened to finish in. The result of `topByAwait` is
ranked, so it comes back in key order, ties broken by arrival, whatever
`ordered` says.
