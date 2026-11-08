# @fulcro/collections

Lazily evaluated sequences with a composable query operator set — and, with its
optional compiler plugin, runtime validation derived from your own types.

```ts
import { SequenceCollection } from '@fulcro/collections';

const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => pilot.callSign)
	.take(10)
	.toArray();
```

```ts
// `response.json()` hands back `any`. This is the last place it is unchecked —
// and the schema is the interface you already wrote.
const reinforcements = SequenceCollection.from(await response.json())
	.cast<RebelPilot>()
	.toArray();
```

The survivors of the Battle of Yavin, and the pilots Echo Base was sent, checked
against the same interface:

```ts
// Needs the @fulcro/collections transformer for `cast<RebelPilot>()`.
import { SequenceCollection } from '@fulcro/collections';

interface RebelPilot {
	callSign: string;
	name: string;
	squadron: string;
	confirmedKills: number;
	active: boolean;
}

const rebelPilots: RebelPilot[] = [
	{
		callSign: 'Red Leader',
		name: 'Garven Dreis',
		squadron: 'Red',
		confirmedKills: 1,
		active: false,
	},
	{
		callSign: 'Red Five',
		name: 'Luke Skywalker',
		squadron: 'Red',
		confirmedKills: 2,
		active: true,
	},
	{
		callSign: 'Gold Leader',
		name: 'Jon Vander',
		squadron: 'Gold',
		confirmedKills: 0,
		active: false,
	},
	{ callSign: 'Red Two', name: 'Wedge Antilles', squadron: 'Red', confirmedKills: 3, active: true },
	{
		callSign: 'Red Three',
		name: 'Biggs Darklighter',
		squadron: 'Red',
		confirmedKills: 1,
		active: false,
	},
];

const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => pilot.callSign)
	.take(10)
	.toArray();

console.log(roster); // ['Red Two', 'Red Five']

const transmission = `[
	{ "callSign": "Rogue Leader", "name": "Luke Skywalker", "squadron": "Rogue", "confirmedKills": 4, "active": true },
	{ "callSign": "Rogue Two", "name": "Zev Senesca", "squadron": "Rogue", "confirmedKills": "1", "active": true }
]`;

try {
	SequenceCollection.from(JSON.parse(transmission)).cast<RebelPilot>().toArray();
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('RebelPilot') found a Object at index 1."
}
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
const echoBase = SequenceCollection.from(probeReports()).where(detectsPowerGenerator); // nothing ran
const sighting = echoBase.first(); // traverses only until the first match
```

The Imperial probe droids, counted as they report — the search stops at the
first planet with a power generator:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ProbeReport {
	planet: string;
	powerGenerator: boolean;
}

let systemsProbed = 0;

const probeReports = function* (): Generator<ProbeReport> {
	for (const planet of ['Dantooine', 'Kessel', 'Hoth', 'Mustafar', 'Dagobah']) {
		systemsProbed++;
		yield { planet, powerGenerator: planet === 'Hoth' };
	}
};

const detectsPowerGenerator = (report: ProbeReport): boolean => report.powerGenerator;

const echoBase = SequenceCollection.from(probeReports()).where(detectsPowerGenerator);

console.log(systemsProbed); // 0 — nothing ran

const sighting = echoBase.first();

console.log(sighting.planet); // 'Hoth'
console.log(systemsProbed); // 3 — Mustafar and Dagobah were never probed
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

Each kind of source the Rebellion's records arrive in:

```ts
import { SequenceCollection } from '@fulcro/collections';

const moons = SequenceCollection.from(new Set(['Endor', 'Yavin 4', 'Endor'])).toArray();

const bounties = SequenceCollection.from(
	new Map([
		['Han Solo', 50_000],
		['Chewbacca', 25_000],
	]),
)
	.select(([fugitive, credits]) => `${fugitive}: ${String(credits)}`)
	.toArray();

const designation = SequenceCollection.from('R2-D2')
	.where((character) => character !== '-')
	.toArray()
	.join('');

const survivorsOfAlderaan = SequenceCollection.empty<string>().count();

console.log(moons); // ['Endor', 'Yavin 4']
console.log(bounties); // ['Han Solo: 50000', 'Chewbacca: 25000']
console.log(designation); // 'R2D2'
console.log(survivorsOfAlderaan); // 0
```

## Index access

A sequence can be read positionally, like an array:

```ts
const systems = SequenceCollection.from(['Tatooine', 'Alderaan', 'Yavin 4']);
systems[0]; // 'Tatooine'
systems[9]; // undefined
```

This is served by a `Proxy`, so a sequence backed by something that is not
indexable is traversed until the position is reached. Reading `sequence[500]`
on a generator-backed sequence walks 501 elements; reading it on an
array-backed one does not.

The Kessel Run, read by position from a generator and from an array:

```ts
import { SequenceCollection } from '@fulcro/collections';

let waypointsCharted = 0;

const kesselRun = function* (): Generator<string> {
	for (const waypoint of ['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']) {
		waypointsCharted++;
		yield waypoint;
	}
};

const route = SequenceCollection.from(kesselRun());

console.log(route[2]); // 'Akkadese Maelstrom'
console.log(waypointsCharted); // 3 — walked to reach it

const charted = SequenceCollection.from(['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']);

console.log(charted[3]); // 'Savareen' — read directly
console.log(charted[9]); // undefined
```

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
const decoded = SequenceCollection.from(interceptedTransmissions()).select(decrypt);

decoded.count(); // reads the generator, runs `decrypt` per transmission
decoded.toArray(); // [] — the generator is spent
```

A chain iterated twice also runs its projections twice, which is fine until the
projection is a parse or a request.

`memoize` fixes both. Elements are remembered as they are read, so the sequence
becomes repeatable and the work behind it happens once:

```ts
const kept = decoded.memoize();

kept.count(); // reads it once
kept.toArray(); // every transmission, and `decrypt` never ran again
```

The cost is memory — everything pulled through is held — and it is paid only for
the part actually consumed.

Imperial transmissions intercepted by Rebel slicers, decrypted with and without
`memoize`:

```ts
import { SequenceCollection } from '@fulcro/collections';

let decryptions = 0;

const decrypt = (cipher: string): string => {
	decryptions++;
	return cipher.split('').reverse().join('');
};

const interceptedTransmissions = function* (): Generator<string> {
	yield 'htoH';
	yield 'nivaY';
	yield 'rodnE';
};

const decoded = SequenceCollection.from(interceptedTransmissions()).select(decrypt);

console.log(decoded.toArray()); // ['Hoth', 'Yavin', 'Endor']
console.log(decoded.toArray()); // [] — the generator is spent

const kept = SequenceCollection.from(interceptedTransmissions()).select(decrypt).memoize();

console.log(kept.toArray()); // ['Hoth', 'Yavin', 'Endor']
console.log(kept.toArray()); // ['Hoth', 'Yavin', 'Endor'] — read again, from memory
console.log(decryptions); // 6 — three per generator, none for the second read of `kept`
```

## Beyond the standard set

A handful of operators that earn their place by doing something the standard set
cannot.

`partition` splits by a condition **in one traversal**, where two `where` calls
read the source twice:

```ts
const [survivors, fallen] = pilots.partition((pilot) => pilot.active);
```

`scan` is `aggregate` that shows its work — a running total rather than only the
final one. It emits one value per element and not the seed, so it stays the same
length as its source:

```ts
SequenceCollection.from([1, 2, 1]).scan(0, (tally, downed) => tally + downed);
// 1, 3, 4
```

`windowed` and `pairwise` yield overlapping runs, for comparing an element with
what came before it:

```ts
shieldReadings.pairwise().select(([previous, current]) => current - previous);
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
pilots.topBy((pilot) => pilot.confirmedKills, 10);
```

Measured over a hundred thousand records for a top ten: **201,400 key
comparisons against 4,532,640 for the sort.** The cost per element does not grow
with how many you ask for, so a window of a thousand costs almost what a window
of one costs.

`choose` projects and filters in a single pass, for when the condition and the
projection are the same work:

```ts
// `findBounty` runs twice per fugitive here…
sightings
	.where((fugitive) => findBounty(fugitive) !== null)
	.select((fugitive) => findBounty(fugitive));

// …and once here.
sightings.choose((fugitive) => findBounty(fugitive));
```

`null` and `undefined` mean "nothing for this element". `0`, `''` and `false`
are kept, because they are answers.

`tap` runs an action for each element as it passes and yields it unchanged — for
looking inside a chain without collapsing it into a terminal operator.

The Battle of Endor, read through each of them — the pilots who came back, the
TIE fighters the Falcon's gunners downed pass by pass, how fast the Death Star's
shield fell, the aces, and the bounties the Guild still holds:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Pilot {
	callSign: string;
	confirmedKills: number;
	active: boolean;
}

const pilots = SequenceCollection.from<Pilot>([
	{ callSign: 'Gold Leader', confirmedKills: 6, active: true },
	{ callSign: 'Red Leader', confirmedKills: 4, active: true },
	{ callSign: 'Green Leader', confirmedKills: 2, active: false },
	{ callSign: 'Gray Leader', confirmedKills: 3, active: false },
	{ callSign: 'Red Two', confirmedKills: 5, active: true },
]);

const [survivors, fallen] = pilots.partition((pilot) => pilot.active);

console.log(survivors.count(), fallen.count()); // 3 2

const tally = SequenceCollection.from([1, 2, 1])
	.scan(0, (tally, downed) => tally + downed)
	.toArray();

console.log(tally); // [1, 3, 4]

const shieldReadings = SequenceCollection.from([100, 92, 75, 75, 40]);

const drops = shieldReadings
	.pairwise()
	.select(([previous, current]) => current - previous)
	.toArray();

console.log(drops); // [-8, -17, 0, -35]

const aces = pilots
	.topBy((pilot) => pilot.confirmedKills, 2)
	.select((pilot) => pilot.callSign)
	.toArray();

console.log(aces); // ['Gold Leader', 'Red Two']

interface Fugitive {
	name: string;
	lastSeen: string;
}

interface Bounty {
	target: string;
	credits: number;
}

const guildBoard = new Map<string, Bounty>([
	['Han Solo', { target: 'Han Solo', credits: 50_000 }],
	['Chewbacca', { target: 'Chewbacca', credits: 25_000 }],
]);

let lookups = 0;

const findBounty = (fugitive: Fugitive): Bounty | null => {
	lookups++;
	return guildBoard.get(fugitive.name) ?? null;
};

const sightings = SequenceCollection.from<Fugitive>([
	{ name: 'Han Solo', lastSeen: 'Endor' },
	{ name: 'Lando Calrissian', lastSeen: 'Endor' },
	{ name: 'Chewbacca', lastSeen: 'Endor' },
]);

const contracts = sightings
	.choose((fugitive) => findBounty(fugitive))
	.select((bounty) => `${bounty.target}: ${String(bounty.credits)}`)
	.toArray();

console.log(contracts); // ['Han Solo: 50000', 'Chewbacca: 25000']
console.log(lookups); // 3 — one per sighting
```

## Validating by type: `ofType<T>()` and `cast<T>()`

Both narrow a mixed sequence to one type. They differ in what happens to an
element that does not fit, which is the reason to have both:

```ts
const intercepted = SequenceCollection.from<unknown>(['Tatooine', 7, 'Hoth']);

intercepted.ofType('string'); // ['Tatooine', 'Hoth'] — 7 is skipped
intercepted.cast('string'); // throws on 7, naming the type and the index
```

Reach for `ofType` when the sequence is **expected** to be mixed, and `cast`
when a wrong element means the data is broken and silence would be the worst
outcome. Both take a `typeof` name or a class, and both narrow the element type
without a cast written by hand.

What survived of a comlink transmission, filtered and then refused:

```ts
import { SequenceCollection } from '@fulcro/collections';

const fragments: unknown[] = ['Alderaan', 'Yavin 4', 1138, 'Scarif', null];

const systems = SequenceCollection.from(fragments).ofType('string').toArray();

console.log(systems); // ['Alderaan', 'Yavin 4', 'Scarif']

try {
	SequenceCollection.from(fragments).cast('string').toArray();
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('string') found a number at index 2."
}
```

### Written as a type

With the plugin wired up, the type argument is enough:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
fragments.ofType<string>(); // → ofType('string')
hangar.ofType<Starship>(); // → ofType(Starship)
```

The docking bay at Mos Eisley, sorted by what is parked in it:

```ts
// Needs the @fulcro/collections transformer.
import { SequenceCollection } from '@fulcro/collections';

class Starship {
	constructor(readonly name: string) {}
}

class Droid {
	constructor(readonly designation: string) {}
}

const hangar = SequenceCollection.from<unknown>([
	new Starship('Millennium Falcon'),
	new Droid('R2-D2'),
	'a crate of spice',
	new Starship('Slave I'),
	new Droid('C-3PO'),
]);

const ships = hangar
	.ofType<Starship>()
	.select((ship) => ship.name)
	.toArray();

const labels = hangar.ofType<string>().toArray();

console.log(ships); // ['Millennium Falcon', 'Slave I']
console.log(labels); // ['a crate of spice']
```

An **interface** has neither a `typeof` name nor a constructor — but it has a
shape, and the compiler knows it completely. So the check is written out:

```ts
interface BountyContract {
	id: number;
	note?: string;
	targets: string[];
	client: { name: string };
	status: 'open' | 'claimed';
	postedAt: Date;
}

contracts.cast<BountyContract>();
```

emits a test for every clause that type implies — the nested object, every
element of the array, the union, the `Date` by `instanceof`, the optional
property allowed to be absent. Which is what makes `cast<T>()` a validator for
untrusted data **derived from the type itself**, with no schema to keep in step
by hand.

Jabba's contracts as they reach the Guild, one of them with its date still a
string:

```ts
// Needs the @fulcro/collections transformer.
import { SequenceCollection } from '@fulcro/collections';

interface BountyContract {
	id: number;
	note?: string;
	targets: string[];
	client: { name: string };
	status: 'open' | 'claimed';
	postedAt: Date;
}

const contracts: unknown[] = [
	{
		id: 1,
		note: 'Alive. Frozen is acceptable.',
		targets: ['Han Solo'],
		client: { name: 'Jabba the Hutt' },
		status: 'claimed',
		postedAt: new Date('1980-05-21'),
	},
	{
		id: 2,
		targets: ['Chewbacca', 'Lando Calrissian'],
		client: { name: 'Jabba the Hutt' },
		status: 'open',
		postedAt: new Date('1983-05-25'),
	},
	{
		id: 3,
		targets: ['Leia Organa'],
		client: { name: 'Jabba the Hutt' },
		status: 'open',
		postedAt: '1983-05-25',
	},
];

const valid = SequenceCollection.from(contracts)
	.take(2)
	.cast<BountyContract>()
	.select(
		(contract) => `#${String(contract.id)} ${contract.status}: ${contract.targets.join(', ')}`,
	)
	.toArray();

console.log(valid); // ['#1 claimed: Han Solo', '#2 open: Chewbacca, Lando Calrissian']

try {
	SequenceCollection.from(contracts).cast<BountyContract>().toArray();
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('BountyContract') found a Object at index 2."
}
```

Covered: primitives, literals, unions, intersections, objects and interfaces
nested to any depth, optional properties, arrays, fixed-length tuples, classes,
and the built-in classes by `instanceof`. Extra properties are accepted, because
structural typing accepts them.

**Types that contain themselves are covered too** — a Jedi lineage of masters
and their padawans, a fleet of squadrons of ships. One that refers back to
itself becomes a function that calls itself, built once where the call sits
rather than per element, and it descends the whole value.

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
reports.ofType<Garrison>({ name: 'Garrison', matches: (value) => isGarrison(value) });
```

The Empire's garrison reports, keyed by whatever planets it holds — an index
signature, so the check is written by hand:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Garrison {
	[planet: string]: number;
}

const isGarrison = (value: unknown): value is Garrison =>
	typeof value === 'object' &&
	value !== null &&
	Object.values(value).every((stormtroopers) => typeof stormtroopers === 'number');

const reports: unknown[] = [
	{ Scarif: 4_000, Jedha: 1_200 },
	'rebel propaganda',
	{ Lothal: 'many' },
];

const garrisons = SequenceCollection.from(reports)
	.ofType<Garrison>({ name: 'Garrison', matches: (value) => isGarrison(value) })
	.toArray();

console.log(garrisons); // [{ Scarif: 4000, Jedha: 1200 }]
```

### What it costs

A shape check is **O(size of the value)** per element — every field of every
record, every element of every array inside it. That is the price of actually
checking, measured at about what the same check written by hand costs. It
short-circuits on the first failing clause, and stays lazy:
`cast<BountyContract>().take(5)` validates five records, not a hundred thousand.

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
🇧🇷 [Leia em português](../../docs/pt-BR/sequences.md).
