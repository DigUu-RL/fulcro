# Async sequences

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/async-sequences.md)

Querying data that arrives over time — pages of an API, lines of a file, rows
from a cursor — with the same operators you already know from
[`Sequence`](./sequences.md).

```sh
npm install @fulcro/collections
```

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

It lives behind its own subpath so a bundle that imports only the synchronous
sequence carries none of it.

## The thirty second version

```ts
const officers = await AsyncSequenceCollection.from(fetchCrewPages())
	.where((member) => member.rank === 'officer')
	.select((member) => member.name)
	.take(10)
	.toArray();
```

If you have used the synchronous sequence, you already know this one. **One rule
covers the whole surface:**

- Operators that used to return a `Sequence` now return an `AsyncSequence`, and
  keep their names.
- Operators that used to return a value now return a `Promise` of it, and keep
  their names.

There is no `toArrayAsync`, no `whereAsync`. `await` is the only thing that
changes at the call site.

The same query against the Death Star's personnel registry, served a page at a
time, with the pages it actually requested counted:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface CrewMember {
	name: string;
	rank: 'officer' | 'stormtrooper' | 'technician';
	station: string;
}

interface CrewPage {
	items: CrewMember[];
	next?: string;
}

const registry: Record<string, CrewPage> = {
	start: {
		items: [
			{ name: 'Grand Moff Tarkin', rank: 'officer', station: 'Overbridge' },
			{ name: 'TK-421', rank: 'stormtrooper', station: 'Docking Bay 327' },
		],
		next: 'page-2',
	},
	'page-2': {
		items: [
			{ name: 'Admiral Motti', rank: 'officer', station: 'Conference room' },
			{ name: 'General Tagge', rank: 'officer', station: 'Conference room' },
		],
		next: 'page-3',
	},
	'page-3': {
		items: [{ name: 'Superlaser gunner', rank: 'technician', station: 'Superlaser' }],
	},
};

let pagesRequested = 0;

const imperialNet = {
	crew: async ({ cursor }: { cursor?: string }): Promise<CrewPage> => {
		pagesRequested++;

		return registry[cursor ?? 'start'];
	},
};

const fetchCrewPages = async function* (): AsyncGenerator<CrewMember> {
	let cursor: string | undefined;

	do {
		const page = await imperialNet.crew({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
};

const officers = await AsyncSequenceCollection.from(fetchCrewPages())
	.where((member) => member.rank === 'officer')
	.select((member) => member.name)
	.take(2)
	.toArray();

console.log(officers); // ['Grand Moff Tarkin', 'Admiral Motti']
console.log(pagesRequested); // 2 — the third page was never requested
```

## Where the elements come from

`from` takes three shapes, and you rarely have to think about which:

```ts
// Something that produces over time.
AsyncSequenceCollection.from(hyperspaceBeacons());

// A plain array or generator, lifted into the async world.
AsyncSequenceCollection.from(['Sullust', 'Endor']);

// An array of promises — the `names.map(load)` shape.
AsyncSequenceCollection.from(names.map((name) => loadJediRecord(name)));
```

All three, feeding the rendezvous plan for the Battle of Endor:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const wait = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

// Beacons answering one at a time, as their signal crosses the galaxy.
const hyperspaceBeacons = async function* (): AsyncGenerator<string> {
	for (const beacon of ['Corellia', 'Kuat', 'Fondor']) {
		await wait(10);
		yield beacon;
	}
};

// A plan already in hand.
const rendezvous = ['Sullust', 'Endor'];

// Records loaded together, each resolving when it is ready.
const loadJediRecord = async (name: string): Promise<string> => {
	await wait(5);

	return `Master ${name}`;
};

console.log(await AsyncSequenceCollection.from(hyperspaceBeacons()).toArray()); // ['Corellia', 'Kuat', 'Fondor']
console.log(await AsyncSequenceCollection.from(rendezvous).toArray()); // ['Sullust', 'Endor']

console.log(await AsyncSequenceCollection.from(['Yoda', 'Kenobi'].map(loadJediRecord)).toArray());
// ['Master Yoda', 'Master Kenobi']
```

An async generator is usually how the first one is written:

```ts
async function* fetchCrewPages(): AsyncGenerator<CrewMember> {
	let cursor: string | undefined;

	do {
		const page = await imperialNet.crew({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}
```

Nothing in that function runs until something consumes the sequence, and it
stops being called the moment the consumer stops asking.

Bothan spies relaying intelligence through a cursor-paged network — the
consumer stops at the first report about the second Death Star, and so does the
network:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface IntelligenceReport {
	source: string;
	subject: string;
}

interface ReportPage {
	items: IntelligenceReport[];
	next?: number;
}

const relay: ReportPage[] = [
	{ items: [{ source: 'Bothan cell 7', subject: 'Imperial supply convoy' }], next: 1 },
	{ items: [{ source: 'Bothan cell 2', subject: 'Second Death Star, Endor system' }], next: 2 },
	{ items: [{ source: 'Bothan cell 4', subject: 'The Emperor will oversee the final stages' }] },
];

const pagesRelayed: number[] = [];

const bothanNetwork = {
	reports: async ({ cursor }: { cursor?: number }): Promise<ReportPage> => {
		const index = cursor ?? 0;

		pagesRelayed.push(index);
		await new Promise((resolve) => setTimeout(resolve, 5));

		return relay[index];
	},
};

async function* interceptReports(): AsyncGenerator<IntelligenceReport> {
	let cursor: number | undefined;

	do {
		const page = await bothanNetwork.reports({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}

const breakthrough = await AsyncSequenceCollection.from(interceptReports())
	.where((report) => report.subject.includes('Death Star'))
	.first();

console.log(`${breakthrough.source}: ${breakthrough.subject}`); // 'Bothan cell 2: Second Death Star, Endor system'
console.log(pagesRelayed); // [0, 1] — "Many Bothans died to bring us this information"; none had to for page 2
```

## Your functions can be sync or async — both just work

Every projection, predicate and action accepts either:

```ts
.where((trooper) => trooper.startsWith('TK'))           // fine
.where(async (trooper) => hasClearance(trooper))        // also fine
```

You never wrap anything, and there is no second operator name to remember.

A boarding check on the Death Star, with one test answered on the spot and one
that has to ask Imperial security:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const securityClearance = new Map([
	['TK-421', false],
	['FN-2187', true],
	['TK-9091', false],
]);

const hasClearance = async (designation: string): Promise<boolean> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	return securityClearance.get(designation) ?? false;
};

const cleared = await AsyncSequenceCollection.from(['TK-421', 'FN-2187', 'CT-7567', 'TK-9091'])
	.where((designation) => designation.startsWith('TK') || designation.startsWith('FN'))
	.where(async (designation) => hasClearance(designation))
	.toArray();

console.log(cleared); // ['FN-2187']
```

## Nothing runs until you ask, and nothing runs ahead

Two properties worth knowing, because they are what make this usable on data too
large to hold.

**Deferred.** Building a chain reads nothing:

```ts
const contacts = AsyncSequenceCollection.from(scannerFeed()).select(identify); // no I/O yet

const identified = await contacts.toArray(); // now it reads
```

**Back pressure.** One element is pulled, processed, and only then is the next
asked for. A file being streamed is never buffered ahead of the code reading it.

And an operator that has what it needs stops pulling — which is the difference
between finishing and hanging on an endless source:

```ts
// `scannerFeed()` never ends. This still returns.
const firstThree = await AsyncSequenceCollection.from(scannerFeed()).take(3).toArray();
```

The Falcon's scanner on the way into the Hoth asteroid field: an endless feed,
read only as far as the question needs:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface ScannerReading {
	contact: string;
	bearing: number;
}

let readingsTaken = 0;

const scannerFeed = async function* (): AsyncGenerator<ScannerReading> {
	const contacts = ['TIE fighter', 'TIE fighter', 'Star Destroyer', 'asteroid', 'TIE interceptor'];

	for (let tick = 0; ; tick++) {
		readingsTaken++;
		await new Promise((resolve) => setTimeout(resolve, 1));

		yield { contact: contacts[tick % contacts.length] ?? 'unknown', bearing: (tick * 37) % 360 };
	}
};

const pursuers = AsyncSequenceCollection.from(scannerFeed())
	.where((reading) => reading.contact.startsWith('TIE'))
	.select((reading) => `${reading.contact} at ${String(reading.bearing)}°`);

console.log(readingsTaken); // 0 — building the chain read nothing

console.log(await pursuers.take(3).toArray());
// ['TIE fighter at 0°', 'TIE fighter at 37°', 'TIE interceptor at 148°']

console.log(readingsTaken); // 5 — and the feed was left where the answer was found
```

## Real scenarios

### Paging an API without holding every page

```ts
const ships = await AsyncSequenceCollection.from(fetchGuildPages())
	.where((hunter) => hunter.active)
	.select((hunter) => hunter.ship)
	.toArray();
```

One page is in memory at a time, however many there are.

The Bounty Hunters' Guild directory, read to the end, one page at a time:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface BountyHunter {
	name: string;
	ship: string;
	active: boolean;
}

const guildDirectory: BountyHunter[][] = [
	[
		{ name: 'Boba Fett', ship: 'Slave I', active: true },
		{ name: 'Bossk', ship: "Hound's Tooth", active: true },
	],
	[
		{ name: 'IG-88', ship: 'IG-2000', active: false },
		{ name: 'Din Djarin', ship: 'Razor Crest', active: true },
	],
	[{ name: 'Cad Bane', ship: 'Justifier', active: false }],
];

let largestPageHeld = 0;

const fetchGuildPages = async function* (): AsyncGenerator<BountyHunter> {
	for (const page of guildDirectory) {
		await new Promise((resolve) => setTimeout(resolve, 5));
		largestPageHeld = Math.max(largestPageHeld, page.length);

		yield* page;
	}
};

const ships = await AsyncSequenceCollection.from(fetchGuildPages())
	.where((hunter) => hunter.active)
	.select((hunter) => hunter.ship)
	.toArray();

console.log(ships); // ['Slave I', "Hound's Tooth", 'Razor Crest']
console.log(largestPageHeld); // 2 — never more than one page in hand
```

### Reading a large file line by line

```ts
const lines = createInterface({
	input: createReadStream('docking-bay-94.log'),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const refusals = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' refused: '))
	.take(100)
	.toArray();
```

`readline` is already an async iterable, so it drops straight in. Reading stops
after the hundredth refusal rather than at the end of the file.

Mos Eisley's docking log, written and then read back the way a real one would
be — streamed, not loaded:

```ts
import { createReadStream, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

import { AsyncSequenceCollection } from '@fulcro/collections/async';

const logPath = join(tmpdir(), 'docking-bay-94.log');

writeFileSync(
	logPath,
	[
		'0907 ARRIVAL Millennium Falcon cleared',
		'0915 DEPARTURE Sandcrawler cleared',
		'0921 INSPECTION Millennium Falcon refused: no Imperial permit',
		'0930 ARRIVAL TIE patrol cleared',
		'0942 INSPECTION Millennium Falcon refused: blaster fire in the bay',
	].join('\n'),
);

const lines = createInterface({
	input: createReadStream(logPath),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const refusals = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' refused: '))
	.select((line) => line.split(' refused: ')[1])
	.take(100)
	.toArray();

console.log(refusals); // ['no Imperial permit', 'blaster fire in the bay']
```

### Writing in batches

```ts
await AsyncSequenceCollection.from(streamCensus())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => imperialArchive.insertMany(batch));
```

`chunk` is how a stream becomes batches without collecting the stream first.

The Empire's census of a stormtrooper legion, streamed into its archive in
batches of five hundred:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const imperialArchive = {
	batches: [] as number[],
	async insertMany(batch: readonly string[]): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 1));
		this.batches.push(batch.length);
	},
};

const streamCensus = async function* (): AsyncGenerator<string> {
	for (let number = 1; number <= 1_250; number++) yield `tk-${String(number).padStart(4, '0')}`;
};

const normalize = (designation: string): string => designation.toUpperCase();

await AsyncSequenceCollection.from(streamCensus())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => imperialArchive.insertMany(batch));

console.log(imperialArchive.batches); // [500, 500, 250]
```

### A running total as values arrive

```ts
const balances = AsyncSequenceCollection.from(wagers()).scan(
	0,
	(balance, wager) => balance + wager.credits,
);

for await (const balance of balances) render(balance);
```

A night at the tables of Canto Bight, the balance shown after every hand:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Wager {
	table: string;
	credits: number;
}

const wagers = async function* (): AsyncGenerator<Wager> {
	yield { table: 'sabacc', credits: 500 };
	yield { table: 'fathier race', credits: -1_200 };
	yield { table: 'sabacc', credits: 2_000 };
};

const screen: string[] = [];

const render = (balance: number): void => {
	screen.push(`${String(balance)} credits`);
};

const balances = AsyncSequenceCollection.from(wagers()).scan(
	0,
	(balance, wager) => balance + wager.credits,
);

for await (const balance of balances) render(balance);

console.log(screen); // ['500 credits', '-700 credits', '1300 credits']
```

## Cancelling

Every terminal accepts an `AbortSignal`:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

const crew = await AsyncSequenceCollection.from(fetchCrewPages()).toArray({
	signal: controller.signal,
});
```

**What abort does, and what it cannot.** A promise has no cancel — that is a fact
about JavaScript, not a gap here. So aborting does exactly two things:

1. No further element is pulled.
2. The promise you are awaiting rejects with the signal's reason.

Work already in flight keeps running to completion; its result is thrown away.
If you expected `abort()` to kill a request mid-flight, it does not — unless the
work itself takes a signal, in which case hand it the same one and it does:

```ts
.select((name) => fetch(`https://archives.jedi-temple.example/${name}`, { signal: controller.signal }))
```

A signal belongs on the terminal rather than on `from`, which means the same
sequence can be consumed twice under different signals.

`AbortSignal.timeout(5_000)` is a shorthand for the controller above.

Han giving up on an endless swarm of TIE fighters, and the archive download the
Emperor cut short — the second hands the same signal to the work itself:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const wait = (milliseconds: number): Promise<void> => {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const tieSwarm = async function* (): AsyncGenerator<string> {
	for (let wave = 1; ; wave++) {
		await wait(10);
		yield `TIE wave ${String(wave)}`;
	}
};

const retreat = new AbortController();

setTimeout(() => retreat.abort(new Error('Never tell me the odds!')), 50);

try {
	await AsyncSequenceCollection.from(tieSwarm()).toArray({ signal: retreat.signal });
} catch (reason) {
	console.log((reason as Error).message); // 'Never tell me the odds!'
}

// Work that takes the signal stops with it, rather than finishing for nobody.
const downloadArchive = (name: string, signal: AbortSignal): Promise<string> => {
	return new Promise((resolve, reject) => {
		const transfer = setTimeout(() => resolve(`${name}: archive restored`), 1_000);

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

const order66 = AbortSignal.timeout(20);

try {
	await AsyncSequenceCollection.from(['Yoda', 'Kenobi'])
		.select((name) => downloadArchive(name, order66))
		.toArray({ signal: order66 });
} catch (reason) {
	console.log((reason as Error).name); // 'TimeoutError'
}
```

## What is different from the synchronous sequence

|                  | `Sequence`    | `AsyncSequence`            |
| ---------------- | ------------- | -------------------------- |
| Consumed with    | `for...of`    | `for await...of`           |
| Terminals return | the value     | a `Promise` of it          |
| Index access     | `sequence[5]` | `elementAtOrNull(5)`       |
| `count()`        | often `O(1)`  | always traverses           |
| Cancellation     | —             | `AbortSignal` on terminals |

**Index access is gone**, and it is not an oversight: `sequence[5]` would have to
hand back a promise from a property read, which means something entirely
different from what it means on the synchronous sequence. `elementAtOrNull(5)`
is the way in.

**`count()` always traverses.** The synchronous sequence can often answer in
`O(1)` because an array declares its length. An `AsyncIterable` declares nothing,
so there is nothing to read ahead of time.

## Operators

| Deferred                                      | Terminal                                  |
| --------------------------------------------- | ----------------------------------------- |
| `where` `select` `selectMany`                 | `toArray` `toSet` `count`                 |
| `take` `skip` `takeWhile` `skipWhile`         | `any` `all` `contains`                    |
| `takeLast` `skipLast`                         | `first` `firstOrNull` `last` `lastOrNull` |
| `distinct` `distinctBy` `concat`              | `single` `singleOrNull`                   |
| `chunk` `scan` `windowed` `pairwise`          | `elementAt` `elementAtOrNull`             |
| `append` `prepend` `defaultIfEmpty`           | `sum` `average` `min` `max`               |
| `choose` `ofType` `cast` `topBy` `tap`        | `minBy` `maxBy` `sequenceEqual`           |
| `groupAdjacent` `zip`                         | `countBy` `toMap` `toLookup`              |
| `except` `exceptBy` `intersect` `intersectBy` | `standardDeviation`                       |
| `union` `unionBy` `join` `groupJoin`          | `sampleStandardDeviation`                 |
|                                               | `forEach` `aggregate`                     |

Plus the concurrent forms: `selectAwait`, `whereAwait`, `chooseAwait`,
`topByAwait` and the terminal `forEachAwait`.

### What is deliberately missing

Six operators of the synchronous sequence are **not** here, and their absence is
the design rather than a gap: `orderBy`, `orderByDescending`, `reverse`,
`groupBy`, `median` and `percentile`.

Every one of them has to hold the entire source before it can produce anything.
`orderBy` cannot emit a first element until the last has arrived; `groupBy`
cannot close a group until it knows no more members are coming. Offering them
with the same shape as the rest would be a memory trap wearing an ordinary
operator's clothes — fine on the fixture in a test, ruinous on the feed in
production.

When you want them, say so out loud:

```ts
const sorted = SequenceCollection.from(await arrivals.toArray()).orderBy((row) => row.arrivedAt);
```

`toArray()` is where holding everything becomes visible, which is exactly where
it belongs.

The Imperial fleet dropping out of hyperspace over Hoth, put in order once it
has all arrived:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Arrival {
	ship: string;
	arrivedAt: number;
}

const hyperspaceExits = async function* (): AsyncGenerator<Arrival> {
	yield { ship: 'Executor', arrivedAt: 3 };
	yield { ship: 'Avenger', arrivedAt: 1 };
	yield { ship: 'Tyrant', arrivedAt: 2 };
};

const arrivals = AsyncSequenceCollection.from(hyperspaceExits());

const order = SequenceCollection.from(await arrivals.toArray())
	.orderBy((row) => row.arrivedAt)
	.select((row) => row.ship)
	.toArray();

console.log(order); // ['Avenger', 'Tyrant', 'Executor']
```

Two that do stream are worth knowing as the answers to the same questions:
**`groupAdjacent`** groups consecutive elements and closes a run as soon as the
key changes, and **`topBy`** ranks without sorting, holding a window rather than
the stream.

### Which of these actually stream

Most hold nothing beyond a window. Three are worth calling out.

**`takeLast` cannot yield before the source ends** — nothing knows the last ten
of something still arriving. What it does keep bounded is memory: ten elements,
not the stream. Its sibling `skipLast` _does_ stream, releasing an element once
`count` more have arrived behind it.

**The set operations and joins read their argument first**, whole, before
yielding anything. What that bounds is the sequence you pass in, never the one
you called it on — so a stream belongs on the outside of a `join`, and a
reasonably sized collection on the inside.

**`countBy` and `toLookup` grow with the number of distinct keys.** Counting by
category over an endless feed is fine; counting by identifier is not.

## Validating a stream as it arrives

`cast<T>()` is here too, and this is where it earns the most. Untrusted data
usually arrives asynchronously — a paginated API, a file being read, a queue —
and the synchronous path would mean collecting all of it in memory first, which
is the thing this type exists to avoid.

```ts
const bounties = AsyncSequenceCollection.from(paginatedBounties()).cast<Bounty>();

for await (const bounty of bounties) {
	// `bounty` is a `Bounty`, checked, one page at a time.
}
```

It refuses **at the element that failed**, so a bad page is caught without the
rest of the feed being fetched:

```text
TypeError: FULCRO1015: cast('Bounty') found a string at index 2.
```

`ofType<T>()` is the same check used to filter rather than to refuse. Both take
a `typeof` name, a class, a test you write, or — with the package's transformer
wired up — the type itself, interfaces included. The full account of what is
covered and what is refused is in
[sequences.md](./sequences.md#oftype-and-cast--the-same-question-two-answers); it
behaves identically here.

A Guild feed with a damaged transmitter in the middle of it, refused at the
damage and not a record later:

```ts
// Needs @fulcro/collections/transformer.
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Bounty {
	target: string;
	credits: number;
}

let recordsFetched = 0;

const paginatedBounties = async function* (): AsyncGenerator<unknown> {
	const feed: unknown[] = [
		{ target: 'Han Solo', credits: 50_000 },
		{ target: 'Grogu', credits: 100_000 },
		'static from a damaged transmitter',
		{ target: 'Mythrol', credits: 5_000 },
	];

	for (const record of feed) {
		recordsFetched++;
		yield record;
	}
};

const accepted: string[] = [];

try {
	for await (const bounty of AsyncSequenceCollection.from(paginatedBounties()).cast<Bounty>()) {
		accepted.push(bounty.target);
	}
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('Bounty') found a string at index 2."
}

console.log(accepted); // ['Han Solo', 'Grogu']
console.log(recordsFetched); // 3 — Mythrol's record was never fetched
```

## `topBy` on a stream

Ranking normally means sorting, and sorting means having everything. `topBy`
keeps a window of the best `count` seen so far instead, so what it holds is
bounded by `count` and not by the length of the stream:

```ts
const slowest = await AsyncSequenceCollection.from(everyJump())
	.topBy((jump) => jump.seconds, 10)
	.toArray();
```

A hundred thousand elements for a top ten holds ten. It does have to reach the
end before it can answer — nothing can know the top ten of a stream that has not
finished — so put a `take` in front of an endless one.

The navigation computer's log of a day's hyperspace jumps, ranked for the three
that took longest:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

interface Jump {
	ship: string;
	seconds: number;
}

const everyJump = async function* (): AsyncGenerator<Jump> {
	yield { ship: 'Millennium Falcon', seconds: 12 };
	yield { ship: 'Ghost', seconds: 47 };
	yield { ship: 'Razor Crest', seconds: 31 };
	yield { ship: 'Slave I', seconds: 25 };
	yield { ship: 'Home One', seconds: 90 };
	yield { ship: 'Tantive IV', seconds: 18 };
};

const slowest = await AsyncSequenceCollection.from(everyJump())
	.topBy((jump) => jump.seconds, 3)
	.select((jump) => `${jump.ship} (${String(jump.seconds)} s)`)
	.toArray();

console.log(slowest); // ['Home One (90 s)', 'Ghost (47 s)', 'Razor Crest (31 s)']
```

`topByAwait` extracts several keys at once, for a key that has to be fetched
rather than read. Ties still break on **arrival**, which is recorded before the
keys are extracted: concurrent work finishes in an order that has nothing to do
with the input, and letting that decide would make the answer depend on which
lookup happened to be quickest.

## `choose` and `tap`

`choose` projects and filters in one pass, awaiting one element at a time;
`chooseAwait` runs several projections at once. The concurrency limit counts
projections **in flight**, not results kept — dropping a result does not free a
slot, or the limit would quietly depend on how much the projection discards.

`tap` observes without consuming, and **awaits** the action before handing the
element on. That is deliberate: an action that writes somewhere should hold the
stream where it is rather than falling behind the elements it is meant to be
observing.
