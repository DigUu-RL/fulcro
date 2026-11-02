# Sequences

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/sequences.md)

Querying arrays, sets, maps and generators with composable operators that only
do the work you actually ask for.

```sh
npm install @fulcro/collections
```

```ts
import { SequenceCollection } from '@fulcro/collections';
```

## The thirty second version

```ts
const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => pilot.callSign)
	.take(10)
	.toArray();
```

Reads like a query, and behaves like one: nothing runs until `toArray()` asks.

The same query with everything around it — the briefing roster for the pilots
still flying after the Battle of Yavin:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface RebelPilot {
	callSign: string;
	name: string;
	squadron: 'Gold' | 'Red' | 'Rogue';
	confirmedKills: number;
	active: boolean;
}

const rebelPilots: RebelPilot[] = [
	{
		callSign: 'Red Leader',
		name: 'Garven Dreis',
		squadron: 'Red',
		confirmedKills: 2,
		active: false,
	},
	{ callSign: 'Red Two', name: 'Wedge Antilles', squadron: 'Red', confirmedKills: 2, active: true },
	{
		callSign: 'Red Three',
		name: 'Biggs Darklighter',
		squadron: 'Red',
		confirmedKills: 1,
		active: false,
	},
	{
		callSign: 'Red Five',
		name: 'Luke Skywalker',
		squadron: 'Red',
		confirmedKills: 3,
		active: true,
	},
	{
		callSign: 'Gold Leader',
		name: 'Jon Vander',
		squadron: 'Gold',
		confirmedKills: 1,
		active: false,
	},
	{
		callSign: 'Rogue Two',
		name: 'Zev Senesca',
		squadron: 'Rogue',
		confirmedKills: 1,
		active: true,
	},
	{
		callSign: 'Rogue Four',
		name: 'Hobbie Klivian',
		squadron: 'Rogue',
		confirmedKills: 2,
		active: true,
	},
];

const roster = SequenceCollection.from(rebelPilots)
	.where((pilot) => pilot.active)
	.orderBy((pilot) => pilot.squadron)
	.thenByDescending((pilot) => pilot.confirmedKills)
	.select((pilot) => `${pilot.callSign} — ${pilot.name}`)
	.take(10)
	.toArray();

console.log(roster);
// [
//   'Red Five — Luke Skywalker',
//   'Red Two — Wedge Antilles',
//   'Rogue Four — Hobbie Klivian',
//   'Rogue Two — Zev Senesca',
// ]
```

## Laziness is the whole point

Building a chain does **no work**:

```ts
const echoBase = SequenceCollection.from(probeReports).where(detectsPowerGenerator); // nothing ran
```

The work happens when something consumes it — `toArray()`, a scalar operator, or
a `for...of` loop. And only as much as it needs:

```ts
echoBase.first(); // stops at the first match, however many reports there are
```

On a million-element array filtered down to a handful, `first()` may look at
three elements. An eager implementation looks at a million, then throws away
999,999 results.

Here is the whole search, with the probe droids counting the systems they
actually visited:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ProbeReport {
	droid: string;
	planet: string;
	signature: 'none' | 'life-form' | 'power-generator';
}

const systemsProbed: string[] = [];

const probeReports = function* (): Generator<ProbeReport> {
	const outerRimTargets = ['Ord Mantell', 'Bespin', 'Hoth', 'Dagobah', 'Endor'];

	for (const [index, planet] of outerRimTargets.entries()) {
		systemsProbed.push(planet);

		yield {
			droid: `Viper ${String(index + 1)}`,
			planet,
			signature: planet === 'Hoth' ? 'power-generator' : 'none',
		};
	}
};

const echoBase = SequenceCollection.from(probeReports()).where(
	(report) => report.signature === 'power-generator',
);

console.log(systemsProbed); // [] — building the query probed nothing

const sighting = echoBase.first();

console.log(`${sighting.droid} found the Rebels on ${sighting.planet}`);
// 'Viper 3 found the Rebels on Hoth'

console.log(systemsProbed); // ['Ord Mantell', 'Bespin', 'Hoth'] — Dagobah and Endor were never probed
```

It works on infinite sources for the same reason:

```ts
const cloneNumbers = function* () {
	for (let n = 1; ; n++) yield n;
};

SequenceCollection.from(cloneNumbers())
	.where((n) => n % 7 === 0)
	.take(5)
	.toArray(); // [7, 14, 21, 28, 35]
```

Kamino's production line never ends, and the query still does — assigning the
first three troopers whose number marks them for the 501st Legion:

```ts
import { SequenceCollection } from '@fulcro/collections';

const cloneNumbers = function* (): Generator<number> {
	for (let n = 1; ; n++) yield n;
};

const legion501 = SequenceCollection.from(cloneNumbers())
	.where((n) => n % 501 === 0)
	.select((n) => `CT-${String(n).padStart(4, '0')}`)
	.take(3)
	.toArray();

console.log(legion501); // ['CT-0501', 'CT-1002', 'CT-1503']
```

### Which operators run immediately

Anything that returns a value rather than a sequence: `toArray`, `count`, `sum`,
`first`, `any`, `aggregate`, `forEach`, and the rest of the right-hand column in
the [reference](#reference) below.

### A run of `where` and `select` is one loop

Adjacent `where` and `select` calls, in any order and any number, are traversed
by a single loop over the source rather than one generator per call. Nothing
you can observe changes: every predicate and projection runs as often, and in
the same order, element by element, as it would stage by stage, and stopping
early still closes the source. What goes away is the cost of resuming one more
generator for every element at every stage. Any other operator in between —
`orderBy`, `take`, `distinct` — starts a new run.

## Creating a sequence

```ts
SequenceCollection.from(rebelFleet); // array, Set, Map, string, generator…
SequenceCollection.empty<Jedi>();
SequenceCollection.range(1, 66); // 1..66
SequenceCollection.repeat('Help me, Obi-Wan Kenobi', 3);
```

`range` and `repeat` generate as they are read, so a million of either costs
nothing until something asks — and both can report their count without
generating any of it.

Each of them, in the place it would be used:

```ts
import { SequenceCollection } from '@fulcro/collections';

// Leia's message, looping on R2-D2's projector.
const hologram = SequenceCollection.repeat("Help me, Obi-Wan Kenobi. You're my only hope.", 3);

// The Ghost's flight log, from a Set: a planet visited twice is listed once,
// in the order it was first reached.
const ghostItinerary = SequenceCollection.from(new Set(['Lothal', 'Garel', 'Lothal', 'Atollon']));

// The companies of a clone legion, numbered without building an array.
const companies = SequenceCollection.range(1, 5).select((n) => `Company ${String(n)}`);

console.log(hologram.count()); // 3 — known without playing the message once
console.log(ghostItinerary.toArray()); // ['Lothal', 'Garel', 'Atollon']
console.log(companies.toArray()); // ['Company 1', 'Company 2', 'Company 3', 'Company 4', 'Company 5']
console.log(SequenceCollection.empty<string>().any()); // false — the Jedi Temple after Order 66
```

## Index access

A sequence reads positionally, like an array:

```ts
const sequence = SequenceCollection.from(['Tatooine', 'Alderaan', 'Yavin 4']);

sequence[1]; // 'Alderaan'
sequence[9]; // undefined
```

Served by a `Proxy`. On an array-backed sequence it is a direct read; on a
generator-backed one it walks until it reaches the position, so `sequence[500]`
costs 501 steps.

The difference shows when the source is a generator that counts its own work —
the Kessel Run, plotted one jump at a time:

```ts
import { SequenceCollection } from '@fulcro/collections';

let jumpsPlotted = 0;

const kesselRun = function* (): Generator<string> {
	for (const waypoint of ['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']) {
		jumpsPlotted++;
		yield waypoint;
	}
};

const route = SequenceCollection.from(kesselRun());

console.log(route[2]); // 'Akkadese Maelstrom'
console.log(jumpsPlotted); // 3 — walked up to the position and no further

const charted = SequenceCollection.from(['Kessel', 'The Maw', 'Akkadese Maelstrom', 'Savareen']);

console.log(charted[3]); // 'Savareen' — an array is read directly
```

## Finding the operator you want

### Filtering and shaping

```ts
.where((pilot) => pilot.active)                 // keep what matches
.select((pilot) => pilot.callSign)              // transform each
.choose((pilot) => pilot.astromech)             // transform, dropping what came back empty
.selectMany((squadron) => squadron.pilots)      // flatten nested arrays
.distinct()                                     // drop duplicates
.distinctBy((pilot) => pilot.homeworld)         // …comparing by a key
.ofType('string')                               // keep one runtime type, narrowing
.cast('string')                                 // …or throw if any element is not
.tap((pilot) => console.log(pilot))             // look, without consuming
.reverse()
```

The squadrons that flew against the first Death Star, shaped four ways:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Pilot {
	callSign: string;
	name: string;
	homeworld: string;
	astromech: string | null;
	active: boolean;
}

interface Squadron {
	name: string;
	pilots: Pilot[];
}

const yavinStrike: Squadron[] = [
	{
		name: 'Red Squadron',
		pilots: [
			{
				callSign: 'Red Five',
				name: 'Luke Skywalker',
				homeworld: 'Tatooine',
				astromech: 'R2-D2',
				active: true,
			},
			{
				callSign: 'Red Three',
				name: 'Biggs Darklighter',
				homeworld: 'Tatooine',
				astromech: null,
				active: false,
			},
			{
				callSign: 'Red Two',
				name: 'Wedge Antilles',
				homeworld: 'Corellia',
				astromech: null,
				active: true,
			},
		],
	},
	{
		name: 'Gold Squadron',
		pilots: [
			{
				callSign: 'Gold Leader',
				name: 'Jon Vander',
				homeworld: 'Yavin 4',
				astromech: null,
				active: false,
			},
		],
	},
];

const pilots = SequenceCollection.from(yavinStrike).selectMany((squadron) => squadron.pilots);

const survivors = pilots
	.where((pilot) => pilot.active)
	.select((pilot) => `${pilot.callSign}: ${pilot.name}`)
	.toArray();

const astromechs = pilots.choose((pilot) => pilot.astromech).toArray();

const homeworlds = pilots
	.distinctBy((pilot) => pilot.homeworld)
	.select((pilot) => pilot.homeworld)
	.toArray();

const launchOrder = pilots
	.select((pilot) => pilot.callSign)
	.reverse()
	.toArray();

console.log(survivors); // ['Red Five: Luke Skywalker', 'Red Two: Wedge Antilles']
console.log(astromechs); // ['R2-D2']
console.log(homeworlds); // ['Tatooine', 'Corellia', 'Yavin 4']
console.log(launchOrder); // ['Gold Leader', 'Red Two', 'Red Three', 'Red Five']
```

#### `choose` — project and filter in one pass

Where the condition and the projection are the same piece of work, splitting
them into `where().select()` means doing that work twice:

```ts
// The guild lookup runs twice for every fugitive that has a bounty.
const contracts = sightings
	.where((fugitive) => findBounty(fugitive) !== null)
	.select((fugitive) => findBounty(fugitive));
```

```ts
// Once.
const contracts = sightings.choose((fugitive) => findBounty(fugitive));
```

`null` and `undefined` mean "nothing for this element". Everything else is kept,
**including `0`, `''` and `false`** — those are answers, and a projection that
means to drop them has to say so. The result type loses the nullability:
`choose` on a `string | null` gives you a `Sequence<string>`.

The Bounty Hunters' Guild matching its board against the latest sightings,
with the lookups counted:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Fugitive {
	name: string;
	lastSeen: string;
}

interface Bounty {
	target: string;
	credits: number;
	postedBy: string;
}

const guildBoard = new Map<string, Bounty>([
	['Han Solo', { target: 'Han Solo', credits: 50_000, postedBy: 'Jabba the Hutt' }],
	['Grogu', { target: 'Grogu', credits: 100_000, postedBy: 'The Client' }],
]);

let lookups = 0;

const findBounty = (fugitive: Fugitive): Bounty | null => {
	lookups++;

	return guildBoard.get(fugitive.name) ?? null;
};

const sightings: Fugitive[] = [
	{ name: 'Han Solo', lastSeen: 'Bespin' },
	{ name: 'Chewbacca', lastSeen: 'Bespin' },
	{ name: 'Grogu', lastSeen: 'Arvala-7' },
];

const contracts = SequenceCollection.from(sightings)
	.choose((fugitive) => findBounty(fugitive))
	.select(
		(bounty) => `${bounty.target}: ${String(bounty.credits)} credits, posted by ${bounty.postedBy}`,
	)
	.toArray();

console.log(contracts);
// ['Han Solo: 50000 credits, posted by Jabba the Hutt', 'Grogu: 100000 credits, posted by The Client']

console.log(lookups); // 3 — one per sighting; where().select() would have made 5
```

#### `ofType` and `cast` — the same question, two answers

Both narrow a mixed sequence to one type. They differ in what they do with an
element that does not fit, and that difference is the reason to have both:

```ts
const intercepted = SequenceCollection.from<unknown>(['Tatooine', 7, 'Hoth']);

intercepted.ofType('string').toArray(); // ['Tatooine', 'Hoth'] — 7 is skipped
intercepted.cast('string').toArray(); // throws on 7
```

Reach for `ofType` when the sequence is **expected** to be mixed, and `cast`
when an element of another type means the data is wrong and silence would be
the worst outcome. The throw names what it found and where:

```text
TypeError: FULCRO1015: cast('string') found a number at index 1.
```

Both, on data where each is the right call — sensor noise that is expected, and
a stolen transmission where any noise means corruption:

```ts
import { SequenceCollection } from '@fulcro/collections';

// Fragments recovered from the Death Star's tractor beam logs: mostly system
// names, some sensor noise that nobody needs.
const fragments: unknown[] = ['Alderaan', 'Yavin 4', 1138, 'Scarif', null];

const systems = SequenceCollection.from(fragments).ofType('string').toArray();

console.log(systems); // ['Alderaan', 'Yavin 4', 'Scarif']

// The plans must be text, every line of them: a number here means the
// transmission was corrupted on its way from Scarif.
const plans: unknown[] = ['exhaust port', 'thermal oscillator', 2187];

try {
	SequenceCollection.from(plans).cast('string').toArray();
} catch (error) {
	console.log((error as Error).message); // "FULCRO1015: cast('string') found a number at index 2."
}
```

Both take either a `typeof` name or a class, and both narrow the type without a
cast written by hand:

```ts
.ofType('string')    .ofType('number')    .ofType('object')
.ofType(Date)        .cast(Starship)
```

A hangar holding more than starships, narrowed by class:

```ts
import { SequenceCollection } from '@fulcro/collections';

class Starship {
	constructor(
		readonly name: string,
		readonly hyperdriveClass: number,
	) {}
}

class Droid {
	constructor(readonly designation: string) {}
}

const hangar: unknown[] = [
	new Starship('Millennium Falcon', 0.5),
	new Droid('C-3PO'),
	new Starship('Ghost', 2),
	'spare parts for a T-65',
];

const ships = SequenceCollection.from(hangar)
	.ofType(Starship)
	.select((ship) => `${ship.name}, hyperdrive class ${String(ship.hyperdriveClass)}`)
	.toArray();

console.log(ships); // ['Millennium Falcon, hyperdrive class 0.5', 'Ghost, hyperdrive class 2']
```

One deliberate disagreement with the language: `ofType('object')` does **not**
match `null`, though `typeof null` is `'object'`. A sequence narrowed to objects
that then throws on a property access would be a trap.

#### Writing the type as a type

With this package's transformer wired up, both take the type directly:

```ts
holocron.ofType<string>(); // Sequence<string>
holocron.ofType<Jedi>(); // Sequence<Jedi>
holocron.cast<Jedi>(); // throws on the first that is not one
```

It resolves the type argument at compile time into the same token the other
forms take — `ofType<string>()` is emitted as `ofType('string')`, and
`ofType<Jedi>()` as `ofType(Jedi)`. Nothing about the runtime changes.

The Jedi Council's roll call, with the transformer applied:

```ts
// Needs @fulcro/collections/transformer, wired as shown below.
import { SequenceCollection } from '@fulcro/collections';

class Jedi {
	constructor(
		readonly name: string,
		readonly blade: 'blue' | 'green' | 'purple',
	) {}
}

class Sith {
	constructor(readonly name: string) {}
}

const chamber: unknown[] = [
	new Jedi('Mace Windu', 'purple'),
	new Jedi('Yoda', 'green'),
	new Sith('Darth Sidious'),
];

const council = SequenceCollection.from(chamber)
	.ofType<Jedi>()
	.select((jedi) => `${jedi.name}, ${jedi.blade} blade`)
	.toArray();

console.log(council); // ['Mace Windu, purple blade', 'Yoda, green blade']
```

The plugin is **optional**, which is the difference from `@fulcro/reflect`:
every operator here works without it, and only these no-argument forms need it.
Wire it the same way:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
// vite.config.ts
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
```

The whole Vite configuration of a fleet tracker using both libraries:

```ts
// vite.config.ts of the Rebel fleet tracker
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fulcroReflect(), fulcroCollections()],
});
```

Both can sit beside `@fulcro/reflect`'s plugin. Each rewrites only the calls it
can trace back to its own package, and neither knows the other exists.

#### An interface works too — it gets written out

A primitive becomes a `typeof` name and a class becomes its constructor. An
interface has neither, but it still has a **shape**, and the compiler knows it
completely. So the transformer writes the check out:

```ts
interface StarshipManifest {
	registry: number;
	nickname?: string;
	crew: string[];
	captain: { name: string };
	status: 'docked' | 'in-hyperspace';
	lastJump: Date;
}

manifests.ofType<StarshipManifest>();
```

becomes, near enough:

```js
manifests.ofType({
	name: 'StarshipManifest',
	matches: (v) =>
		v !== null &&
		typeof v === 'object' &&
		typeof v.registry === 'number' &&
		(v.nickname === undefined || typeof v.nickname === 'string') &&
		Array.isArray(v.crew) &&
		v.crew.every((e) => typeof e === 'string') &&
		v.captain !== null &&
		typeof v.captain === 'object' &&
		typeof v.captain.name === 'string' &&
		(v.status === 'docked' || v.status === 'in-hyperspace') &&
		v.lastJump instanceof Date,
});
```

Which makes `cast<T>()` a **validator for untrusted data, derived from the type
itself**:

```ts
const manifests = SequenceCollection.from(JSON.parse(transmission))
	.cast<StarshipManifest>()
	.toArray();
```

`JSON.parse` hands back `any`. That line is the last place the data is
unchecked — and the schema is the interface you already wrote, so it cannot
drift out of step with it the way a hand-maintained one does.

Mos Eisley's docking control, reading a transmission it has no reason to trust:

```ts
// Needs @fulcro/collections/transformer.
import { SequenceCollection } from '@fulcro/collections';

interface DockingRecord {
	bay: number;
	ship: string;
	captain: { name: string; species: string };
	cargo: string[];
	paid: boolean;
}

const transmission = `[
	{ "bay": 94, "ship": "Millennium Falcon", "captain": { "name": "Han Solo", "species": "Human" }, "cargo": ["coaxium"], "paid": false },
	{ "bay": 86, "ship": "Slave I", "captain": { "name": "Boba Fett", "species": "Human" }, "cargo": ["carbonite"], "paid": true }
]`;

const debtors = SequenceCollection.from(JSON.parse(transmission))
	.cast<DockingRecord>()
	.where((record) => !record.paid)
	.select((record) => `Bay ${String(record.bay)}: ${record.captain.name}, ${record.ship}`)
	.toArray();

console.log(debtors); // ['Bay 94: Han Solo, Millennium Falcon']

// A record with "bay": "ninety-four" would throw at that record, naming it,
// before anything downstream read a field of it.
```

Covered: primitives, literals, unions, intersections, objects and interfaces
nested to any depth, optional properties, arrays (every element, not a sample),
fixed-length tuples, classes, and `Date`, `Map`, `Set`, `RegExp` and friends by
`instanceof`.

#### Types that contain themselves

A lineage of masters and apprentices, a fleet of fleets, a holocron indexing
other holocrons — these are ordinary shapes, and they are covered. A type that
refers back to itself becomes a function that calls itself:

```ts
interface JediLineage {
	name: string;
	rank: string;
	apprentices: JediLineage[];
}

lineages.cast<JediLineage>();
```

```js
lineages.cast(
	(() => {
		const check0 = (r) =>
			r !== null &&
			typeof r === 'object' &&
			typeof r.name === 'string' &&
			typeof r.rank === 'string' &&
			Array.isArray(r.apprentices) &&
			r.apprentices.every((e) => check0(e));

		return { name: 'JediLineage', matches: (v) => check0(v) };
	})(),
);
```

The function is built **once**, where the call sits — not per element — and it
adds no name to your scope. Cycles running through a second type work the same
way: a `Master` holding `Padawan[]` holding a `Master` is one cycle and gets one
function.

It descends the whole value, so a reply four levels down with a wrong field is
rejected like any other. The depth it can handle is the depth your runtime's
call stack can handle, which for realistic trees is not a limit you will meet.

Yoda's line, six generations deep, validated and then walked:

```ts
// Needs @fulcro/collections/transformer.
import { SequenceCollection } from '@fulcro/collections';

interface JediLineage {
	name: string;
	rank: string;
	apprentices: JediLineage[];
}

const archive = `[{
	"name": "Yoda", "rank": "Grand Master", "apprentices": [{
		"name": "Dooku", "rank": "Master", "apprentices": [{
			"name": "Qui-Gon Jinn", "rank": "Master", "apprentices": [{
				"name": "Obi-Wan Kenobi", "rank": "Master", "apprentices": [{
					"name": "Anakin Skywalker", "rank": "Knight", "apprentices": [{
						"name": "Ahsoka Tano", "rank": "Padawan", "apprentices": []
					}]
				}]
			}]
		}]
	}]
}]`;

const generations = (jedi: JediLineage): number => {
	return 1 + Math.max(0, ...jedi.apprentices.map(generations));
};

const depth = SequenceCollection.from(JSON.parse(archive))
	.cast<JediLineage>()
	.select(generations)
	.first();

console.log(depth); // 6

// Had Ahsoka's "rank" been 7, cast would have thrown at Yoda — the record
// that contains her — without anything reading a wrong rank.
```

**Extra properties are accepted**, because structural typing accepts them. An
object carrying more than `DockingRecord` requires is still a `DockingRecord`,
and rejecting it would make this disagree with the compiler that produced it.

#### What it refuses, and why that is the point

A check that answers "yes" to the wrong thing is worse than no check: it is
false confidence exactly where the data is least trustworthy. So anything the
transformer cannot write out completely, it refuses — there is no partial or
optimistic check anywhere in it.

Refused: index signatures, unresolved generics, and a class brought in with
`import type`, which is erased before the emitted code could reference it.

```text
Error: FULCRO1016: ofType<T>() was not resolved at compile time. Either the
@fulcro/collections transformer did not run over this file, or T has no runtime
representation — an interface leaves nothing to test for, so pass a class, a
typeof name, or use where() with a predicate.
```

The message names both causes on purpose: from inside the running program they
are indistinguishable, and guessing between them would be worse than saying so.
It throws when the chain is **built**, not when it is first read — a call that
was never resolved is a build wired wrong, not data gone wrong.

For a refused type, write the check yourself and pass it in the same shape:

```ts
records.ofType<Holocron>({
	name: 'Holocron',
	matches: (v) => isHolocron(v),
});
```

A holocron is an index signature — any era, any text — which is exactly the
shape the transformer will not guess at. The archive check, written by hand:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Holocron {
	[era: string]: string;
}

const isHolocron = (value: unknown): value is Holocron => {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.values(value).every((entry) => typeof entry === 'string')
	);
};

const jediArchive: unknown[] = [
	{ 'Old Republic': 'The Rule of Two', 'High Republic': 'The Great Hyperspace Disaster' },
	{ 'Clone Wars': 66 },
	{ 'Age of Rebellion': 'The Battle of Yavin' },
];

const readable = SequenceCollection.from(jediArchive)
	.ofType<Holocron>({ name: 'Holocron', matches: isHolocron })
	.selectMany((holocron) => Object.keys(holocron))
	.toArray();

console.log(readable); // ['Old Republic', 'High Republic', 'Age of Rebellion']
```

#### What it costs

A shape check is **O(size of the value)** per element, not a constant: every
field of every record, and every element of every array inside it. That is the
honest price of actually checking, and on a hundred thousand records with nested
line items it is real work — measured at about what the same check written by
hand costs, which is the most that can be asked of it.

It short-circuits on the first clause that fails, and it is lazy like everything
else, so `cast<DockingRecord>().take(5)` validates five records rather than all
of them.

### Taking a slice

```ts
.take(10)          .takeLast(10)     .takeWhile((reading) => reading.strength > 0)
.skip(10)          .skipLast(10)     .skipWhile((reading) => reading.strength === 100)
.chunk(100)        // arrays of 100
.windowed(3)       // overlapping runs of 3
.pairwise()        // each element with the one before it
```

`takeWhile` stops at the first element that fails — unlike `where`, which would
keep a later match.

The shield generator on Endor's forest moon, read once a minute while the strike
team works on the bunker door:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ShieldReading {
	minute: number;
	strength: number;
}

const endorShield: ShieldReading[] = [
	{ minute: 0, strength: 100 },
	{ minute: 1, strength: 100 },
	{ minute: 2, strength: 100 },
	{ minute: 3, strength: 64 },
	{ minute: 4, strength: 12 },
	{ minute: 5, strength: 0 },
	{ minute: 6, strength: 0 },
];

const readings = SequenceCollection.from(endorShield);

const heldAtFull = readings.takeWhile((reading) => reading.strength === 100).count();

const drops = readings
	.pairwise()
	.select(([before, after]) => before.strength - after.strength)
	.where((drop) => drop > 0)
	.toArray();

const afterTheBreach = readings
	.skipWhile((reading) => reading.strength > 0)
	.select((reading) => reading.minute)
	.toArray();

const reportBlocks = readings
	.chunk(3)
	.select((block) => block.length)
	.toArray();

console.log(heldAtFull); // 3
console.log(drops); // [36, 52, 12]
console.log(afterTheBreach); // [5, 6] — the minutes the fleet had to make its run
console.log(reportBlocks); // [3, 3, 1]
```

### Ordering

```ts
.orderBy((racer) => racer.lapsCompleted)
.thenByDescending((racer) => racer.topSpeed)
.topBy((racer) => racer.topSpeed, 10)   // the best 10, without sorting the rest
```

Secondary criteria are only consulted when the earlier ones tie. Sorting extracts
each key **once per element**, not twice per comparison, which on a hundred
thousand records is the difference between 100,000 and 1,700,000 calls to your
projection.

The Boonta Eve Classic, ranked twice — the full standings, and the two fastest
pods without sorting the field:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Podracer {
	pilot: string;
	lapsCompleted: number;
	bestLapSeconds: number;
	topSpeed: number;
}

const boontaEve: Podracer[] = [
	{ pilot: 'Sebulba', lapsCompleted: 3, bestLapSeconds: 61.2, topSpeed: 929 },
	{ pilot: 'Ben Quadinaros', lapsCompleted: 0, bestLapSeconds: 0, topSpeed: 0 },
	{ pilot: 'Anakin Skywalker', lapsCompleted: 3, bestLapSeconds: 60.9, topSpeed: 947 },
	{ pilot: 'Mawhonic', lapsCompleted: 1, bestLapSeconds: 66.4, topSpeed: 812 },
	{ pilot: 'Gasgano', lapsCompleted: 3, bestLapSeconds: 62.4, topSpeed: 874 },
];

const standings = SequenceCollection.from(boontaEve)
	.orderByDescending((racer) => racer.lapsCompleted)
	.thenBy((racer) => racer.bestLapSeconds)
	.select((racer) => racer.pilot)
	.toArray();

const fastestPods = SequenceCollection.from(boontaEve)
	.topBy((racer) => racer.topSpeed, 2)
	.select((racer) => `${racer.pilot} at ${String(racer.topSpeed)} km/h`)
	.toArray();

console.log(standings); // ['Anakin Skywalker', 'Sebulba', 'Gasgano', 'Mawhonic', 'Ben Quadinaros']
console.log(fastestPods); // ['Anakin Skywalker at 947 km/h', 'Sebulba at 929 km/h']
```

### Grouping

```ts
.groupBy((ship) => ship.faction)              // all ships per faction
.groupAdjacent((entry) => entry.alert)         // runs of consecutive equal keys
.countBy((ship) => ship.faction)               // Map<faction, count>
.toLookup((ship) => ship.faction)              // Map<faction, ships[]>
```

`groupBy` collects a key wherever it appears; `groupAdjacent` starts a new group
every time the key changes, and buffers only the run in hand. Use the second for
data already in order — log lines, readings by day.

A `Group<K, T>` is a full sequence carrying a `key`, so operators chain onto it:

```ts
.groupBy((ship) => ship.faction)
.select((group) => ({ faction: group.key, crew: group.sum((ship) => ship.crew) }))
```

The fleets over Endor, and Echo Base's alert log on the morning of the attack:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Ship {
	name: string;
	faction: 'Rebel Alliance' | 'Galactic Empire';
	crew: number;
}

const endorFleets: Ship[] = [
	{ name: 'Home One', faction: 'Rebel Alliance', crew: 5_402 },
	{ name: 'Executor', faction: 'Galactic Empire', crew: 279_144 },
	{ name: 'Millennium Falcon', faction: 'Rebel Alliance', crew: 4 },
	{ name: 'Tydirium', faction: 'Rebel Alliance', crew: 2 },
];

const crewPerFaction = SequenceCollection.from(endorFleets)
	.groupBy((ship) => ship.faction)
	.select((group) => ({ faction: group.key, crew: group.sum((ship) => ship.crew) }))
	.toArray();

const shipsPerFaction = SequenceCollection.from(endorFleets).countBy((ship) => ship.faction);

const namesPerFaction = SequenceCollection.from(endorFleets).toLookup(
	(ship) => ship.faction,
	(ship) => ship.name,
);

console.log(crewPerFaction);
// [{ faction: 'Rebel Alliance', crew: 5408 }, { faction: 'Galactic Empire', crew: 279144 }]

console.log(shipsPerFaction.get('Rebel Alliance')); // 3
console.log(namesPerFaction.get('Galactic Empire')); // ['Executor']

interface LogEntry {
	time: string;
	alert: 'green' | 'yellow' | 'red';
	note: string;
}

const echoBaseLog: LogEntry[] = [
	{ time: '0600', alert: 'green', note: 'Patrols out on tauntauns' },
	{ time: '0615', alert: 'green', note: 'Sensor sweep of the northern ridge' },
	{ time: '0640', alert: 'yellow', note: 'Probe droid destroyed' },
	{ time: '0702', alert: 'red', note: 'Imperial walkers sighted' },
	{ time: '0703', alert: 'red', note: 'Begin evacuation' },
];

const alertRuns = SequenceCollection.from(echoBaseLog)
	.groupAdjacent((entry) => entry.alert)
	.select((run) => `${run.key} from ${run.first().time} (${String(run.count())})`)
	.toArray();

console.log(alertRuns); // ['green from 0600 (2)', 'yellow from 0640 (1)', 'red from 0702 (2)']
```

### Combining two sequences

```ts
.concat(reinforcements)                         // everything from both
.union(reinforcements)                          // both, without duplicates
.intersect(survivors)                           // only what is in both
.except(fallen)                                 // what is not in the other
.zip(callSigns, (pilot, callSign) => …)         // pairwise, stopping at the shorter
```

Each has an `*By` counterpart taking a key selector — `unionBy`, `exceptBy`,
`intersectBy` — which is usually what you want with records.

The Battle of Yavin from the hangar deck — who launched, who came back, and who
stood on the dais at the ceremony:

```ts
import { SequenceCollection } from '@fulcro/collections';

const launched = [
	'Luke Skywalker',
	'Wedge Antilles',
	'Biggs Darklighter',
	'Garven Dreis',
	'Jon Vander',
];
const returned = ['Luke Skywalker', 'Wedge Antilles'];
const callSigns = ['Red Five', 'Red Two', 'Red Three', 'Red Leader', 'Gold Leader'];

const lost = SequenceCollection.from(launched).except(returned).toArray();

const flightLog = SequenceCollection.from(launched)
	.zip(callSigns, (pilot, callSign) => `${callSign}: ${pilot}`)
	.toArray();

const decorated = SequenceCollection.from(returned)
	.union(['Han Solo', 'Chewbacca', 'Luke Skywalker'])
	.toArray();

const onBothLists = SequenceCollection.from(launched)
	.intersect(['Han Solo', 'Luke Skywalker'])
	.toArray();

console.log(lost); // ['Biggs Darklighter', 'Garven Dreis', 'Jon Vander']
console.log(flightLog[0]); // 'Red Five: Luke Skywalker'
console.log(decorated); // ['Luke Skywalker', 'Wedge Antilles', 'Han Solo', 'Chewbacca']
console.log(onBothLists); // ['Luke Skywalker']
```

### Joining

```ts
// One result per matching pair, like a SQL inner join.
.join(starships, (captain) => captain.shipId, (ship) => ship.id, (captain, ship) => ({ …captain, ship }))

// One result per outer element, with its matches as a group — a left join.
.groupJoin(captains, (ship) => ship.id, (captain) => captain.shipId, (ship, theirs) => …)
```

The inner sequence is indexed once, not once per outer element.

Who has flown what — every captain with their ship, and every ship with all of
its captains, including the one nobody in the list has flown:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Captain {
	name: string;
	shipId: string;
}

interface Starship {
	id: string;
	name: string;
}

const captains: Captain[] = [
	{ name: 'Lando Calrissian', shipId: 'falcon' },
	{ name: 'Han Solo', shipId: 'falcon' },
	{ name: 'Hera Syndulla', shipId: 'ghost' },
	{ name: 'Din Djarin', shipId: 'razor-crest' },
];

const starships: Starship[] = [
	{ id: 'falcon', name: 'Millennium Falcon' },
	{ id: 'ghost', name: 'Ghost' },
	{ id: 'razor-crest', name: 'Razor Crest' },
	{ id: 'slave-i', name: 'Slave I' },
];

const assignments = SequenceCollection.from(captains)
	.join(
		starships,
		(captain) => captain.shipId,
		(ship) => ship.id,
		(captain, ship) => `${captain.name} flies the ${ship.name}`,
	)
	.toArray();

const ownership = SequenceCollection.from(starships)
	.groupJoin(
		captains,
		(ship) => ship.id,
		(captain) => captain.shipId,
		(ship, theirs) => ({
			ship: ship.name,
			captains: theirs.select((captain) => captain.name).toArray(),
		}),
	)
	.toArray();

console.log(assignments[1]); // 'Han Solo flies the Millennium Falcon'
console.log(ownership[0]); // { ship: 'Millennium Falcon', captains: ['Lando Calrissian', 'Han Solo'] }
console.log(ownership[3]); // { ship: 'Slave I', captains: [] }
```

### Getting a single element

```ts
.first()            .firstOrNull()       // throws / null when empty
.last()             .lastOrNull()
.single()           .singleOrNull()      // exactly one, or it is an error
.elementAt(5)       .elementAtOrNull(5)
```

`single` differs from `first` on purpose: a second match is as much of a problem
as none. `singleOrNull` still throws on two — an ambiguous answer is a defect in
the query, not an absence to tolerate.

Seating the Jedi High Council, where some questions have one right answer and
some have none:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CouncilMember {
	name: string;
	species: string;
	seat: number;
}

const council = SequenceCollection.from<CouncilMember>([
	{ name: 'Yoda', species: 'unknown', seat: 1 },
	{ name: 'Mace Windu', species: 'Human', seat: 2 },
	{ name: 'Ki-Adi-Mundi', species: 'Cerean', seat: 3 },
	{ name: 'Plo Koon', species: 'Kel Dor', seat: 4 },
]);

console.log(council.single((member) => member.species === 'Cerean').name); // 'Ki-Adi-Mundi'
console.log(council.singleOrNull((member) => member.species === 'Wookiee')); // null
console.log(council.first((member) => member.seat > 1).name); // 'Mace Windu'
console.log(council.last().name); // 'Plo Koon'
console.log(council.elementAtOrNull(12)); // null — Anakin was not given a seat

// council.single((member) => member.seat > 2) throws: Ki-Adi-Mundi and Plo
// Koon both match, and picking one would hide that the question was wrong.
```

### Asking a question

```ts
.any()                          .any((fighter) => !fighter.hyperdriveOnline)
.all((fighter) => fighter.torpedoes > 0)
.contains('Red Five')
.count()                        .count((fighter) => fighter.model === 'Y-wing')
.sequenceEqual(briefingOrder)
```

`count()` often answers **without traversing** — an array knows its length, and
that knowledge survives `select`, `take`, `skip`, `concat`, `chunk` and more.

The pre-flight check before the trench run:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Fighter {
	callSign: string;
	model: 'X-wing' | 'Y-wing';
	torpedoes: number;
	hyperdriveOnline: boolean;
}

const trenchRun: Fighter[] = [
	{ callSign: 'Red Five', model: 'X-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Red Two', model: 'X-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Gold Leader', model: 'Y-wing', torpedoes: 2, hyperdriveOnline: true },
	{ callSign: 'Gold Five', model: 'Y-wing', torpedoes: 2, hyperdriveOnline: false },
];

const fighters = SequenceCollection.from(trenchRun);
const callSigns = fighters.select((fighter) => fighter.callSign);

console.log(fighters.all((fighter) => fighter.torpedoes > 0)); // true
console.log(fighters.any((fighter) => !fighter.hyperdriveOnline)); // true — Gold Five cannot jump out
console.log(fighters.count((fighter) => fighter.model === 'Y-wing')); // 2
console.log(callSigns.contains('Red Five')); // true
console.log(callSigns.count()); // 4 — the array's length, carried through select, nothing walked
console.log(callSigns.sequenceEqual(['Red Five', 'Red Two', 'Gold Leader', 'Gold Five'])); // true
```

### Numbers

```ts
.sum((bounty) => bounty.credits)         .average((bounty) => bounty.credits)
.min((bounty) => bounty.credits)         .max((bounty) => bounty.credits)
.minBy((bounty) => bounty.credits)       .maxBy((bounty) => bounty.credits)   // the record, not the value
.median((bounty) => bounty.credits)      .percentile(95, (bounty) => bounty.credits)
.standardDeviation((bounty) => bounty.credits)
.sampleStandardDeviation((bounty) => bounty.credits)
```

`min` gives you the smallest number; `minBy` gives you the **bounty that carried
it**, which is usually what you wanted.

The two standard deviations are separate names rather than one with a flag. They
divide by `n` and by `n - 1`, the answers diverge most exactly when the data is
small, and a quiet default would be wrong half the time. Use the population form
for the whole set, the sample form for a sample drawn from something larger.

The Guild's bounty board, summarised for a hunter choosing a job:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Bounty {
	target: string;
	credits: number;
}

const board = SequenceCollection.from<Bounty>([
	{ target: 'Han Solo', credits: 50_000 },
	{ target: 'Chewbacca', credits: 15_000 },
	{ target: 'Mythrol', credits: 5_000 },
	{ target: 'Grogu', credits: 100_000 },
]);

const credits = (bounty: Bounty): number => bounty.credits;

console.log(board.sum(credits)); // 170000
console.log(board.average(credits)); // 42500
console.log(board.max(credits)); // 100000
console.log(board.maxBy(credits).target); // 'Grogu' — the bounty, not the number
console.log(board.minBy(credits).target); // 'Mythrol'
console.log(board.median(credits)); // 32500
console.log(Math.round(board.standardDeviation(credits))); // 37165 — the whole board
console.log(Math.round(board.sampleStandardDeviation(credits))); // 42915 — as a sample of every board in the galaxy
```

### Accumulating

```ts
.aggregate(0, (balance, entry) => balance + entry.credits)   // one final value
.scan(0, (balance, entry) => balance + entry.credits)        // every running value
```

`scan` is `aggregate` that shows its work — a balance after each transaction
rather than only the last one. It emits one value per element, so it stays the
same length as its source and can be zipped with it.

The Millennium Falcon's ledger from Mos Eisley to the medal ceremony:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface LedgerEntry {
	note: string;
	credits: number;
}

const ledger: LedgerEntry[] = [
	{ note: 'Charter to Alderaan, paid up front by Obi-Wan Kenobi', credits: 2_000 },
	{ note: 'Docking Bay 94 fees', credits: -1_750 },
	{ note: 'Reward for rescuing Princess Leia', credits: 15_000 },
];

const entries = SequenceCollection.from(ledger);

const finalBalance = entries.aggregate(0, (balance, entry) => balance + entry.credits);

const statement = entries
	.scan(0, (balance, entry) => balance + entry.credits)
	.zip(ledger, (balance, entry) => `${entry.note}: ${String(balance)}`)
	.toArray();

console.log(finalBalance); // 15250
console.log(statement);
// [
//   'Charter to Alderaan, paid up front by Obi-Wan Kenobi: 2000',
//   'Docking Bay 94 fees: 250',
//   'Reward for rescuing Princess Leia: 15250',
// ]
```

### Splitting in one pass

```ts
const [lightSide, darkSide] = forceUsers.partition((user) => user.side === 'light');
```

Two `where` calls read the source twice. This reads it once — which a generator
cannot survive otherwise, and which halves the work of an expensive predicate.

A holocron that can be read only once, sorted into the two sides of the Force:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ForceUser {
	name: string;
	side: 'light' | 'dark';
}

let recordsRead = 0;

const holocron = function* (): Generator<ForceUser> {
	const records: ForceUser[] = [
		{ name: 'Luke Skywalker', side: 'light' },
		{ name: 'Darth Vader', side: 'dark' },
		{ name: 'Ahsoka Tano', side: 'light' },
		{ name: 'Darth Maul', side: 'dark' },
		{ name: 'Rey', side: 'light' },
	];

	for (const record of records) {
		recordsRead++;
		yield record;
	}
};

const [lightSide, darkSide] = SequenceCollection.from(holocron()).partition(
	(user) => user.side === 'light',
);

console.log(lightSide.select((user) => user.name).toArray()); // ['Luke Skywalker', 'Ahsoka Tano', 'Rey']
console.log(darkSide.select((user) => user.name).toArray()); // ['Darth Vader', 'Darth Maul']
console.log(recordsRead); // 5 — the holocron was read once, for both sides
```

### Materializing

```ts
.toArray()      .toSet()
.toMap((trooper) => trooper.designation)   // rejects a duplicate key
.toLookup((trooper) => trooper.legion)      // collects duplicates instead
```

The Grand Army's personnel files, indexed the two ways a quartermaster needs:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CloneTrooper {
	designation: string;
	nickname: string;
	legion: string;
}

const troopers: CloneTrooper[] = [
	{ designation: 'CT-7567', nickname: 'Rex', legion: '501st' },
	{ designation: 'CT-5555', nickname: 'Fives', legion: '501st' },
	{ designation: 'CC-2224', nickname: 'Cody', legion: '212th' },
	{ designation: 'CT-21-0408', nickname: 'Echo', legion: '501st' },
];

const personnel = SequenceCollection.from(troopers);

const byDesignation = personnel.toMap((trooper) => trooper.designation);
const byLegion = personnel.toLookup(
	(trooper) => trooper.legion,
	(trooper) => trooper.nickname,
);
const legions = personnel.select((trooper) => trooper.legion).toSet();

console.log(byDesignation.get('CT-7567')?.nickname); // 'Rex'
console.log(byLegion.get('501st')); // ['Rex', 'Fives', 'Echo']
console.log(legions); // Set(2) { '501st', '212th' }

// personnel.toMap((trooper) => trooper.legion) throws: '501st' is the key of
// three troopers, and a map keeping only one of them would lose two in silence.
```

## The one thing that will surprise you

A sequence over a **generator** — or any other single-pass source — yields
nothing on a second traversal. Silently, because an exhausted iterator is
indistinguishable from an empty one:

```ts
const query = SequenceCollection.from(interceptedSignals()).select(decrypt);

query.count(); // reads the generator
query.toArray(); // [] — the generator is spent
```

A chain iterated twice also runs its projections twice, which is fine until the
projection is a parse or a request.

`memoize` fixes both:

```ts
const kept = query.memoize();

kept.count(); // reads it once
kept.toArray(); // every signal, and `decrypt` never ran again
```

Elements are remembered as they are read, so the cost is memory — paid only for
the part you actually consumed.

The whole trap and the way out of it, with the decryptions counted:

```ts
import { SequenceCollection } from '@fulcro/collections';

let decryptions = 0;

const decrypt = (signal: string): string => {
	decryptions++;

	return signal.toUpperCase();
};

const interceptedSignals = function* (): Generator<string> {
	yield 'scarif';
	yield 'jedha';
	yield 'eadu';
};

const once = SequenceCollection.from(interceptedSignals()).select(decrypt);

console.log(once.count()); // 3
console.log(once.toArray()); // [] — the generator was spent by count()

decryptions = 0;

const kept = SequenceCollection.from(interceptedSignals()).select(decrypt).memoize();

console.log(kept.count()); // 3
console.log(kept.toArray()); // ['SCARIF', 'JEDHA', 'EADU']
console.log(decryptions); // 3 — once per signal, however often it is read
```

**Arrays are not affected.** This only bites on generators, iterators and
anything else that can be walked once.

## Real scenarios

### A top-ten list from a large array

```ts
const busiest = SequenceCollection.from(jobs)
	.groupBy((job) => job.smuggler)
	.select((group) => ({ smuggler: group.key, jobs: group.count() }))
	.topBy((row) => row.jobs, 10)
	.toArray();
```

`topBy` answers exactly what `orderByDescending(...).take(10)` answers — same
elements, same order, ties broken the same way — without sorting the part it is
going to throw away. It keeps a window of the best ten seen so far, so each
element costs one comparison against the weakest of them.

On a hundred thousand records asking for ten, measured: **201,400 key
comparisons for `topBy` against 4,532,640 for the sort**, a factor of 22. The
cost per element does not grow with how many you ask for, which is why the
window can be a thousand for almost the same price as one.

Use the sort when you want the whole thing ordered; use `topBy` when you only
ever wanted the head of it.

The busiest smugglers in Mos Eisley this season, from the cantina's job book:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface SmugglingJob {
	smuggler: string;
	cargo: string;
	client: string;
}

const jobBook: SmugglingJob[] = [
	{ smuggler: 'Han Solo', cargo: 'spice', client: 'Jabba the Hutt' },
	{ smuggler: 'Lando Calrissian', cargo: 'Tibanna gas', client: 'Cloud City' },
	{ smuggler: 'Han Solo', cargo: 'coaxium', client: 'Crimson Dawn' },
	{ smuggler: 'Hondo Ohnaka', cargo: 'kyber crystals', client: 'unknown' },
	{ smuggler: 'Han Solo', cargo: 'passengers', client: 'Obi-Wan Kenobi' },
	{ smuggler: 'Lando Calrissian', cargo: 'droids', client: 'Rebel Alliance' },
];

const busiest = SequenceCollection.from(jobBook)
	.groupBy((job) => job.smuggler)
	.select((group) => ({ smuggler: group.key, jobs: group.count() }))
	.topBy((row) => row.jobs, 2)
	.toArray();

console.log(busiest); // [{ smuggler: 'Han Solo', jobs: 3 }, { smuggler: 'Lando Calrissian', jobs: 2 }]
```

### Paging

```ts
const onPage = SequenceCollection.from(bounties)
	.where((bounty) => bounty.sector === sector)
	.orderByDescending((bounty) => bounty.credits)
	.skip(page * size)
	.take(size)
	.toArray();
```

The Guild's terminal, showing the Outer Rim board two bounties at a time:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface Bounty {
	target: string;
	sector: 'Outer Rim' | 'Core Worlds';
	credits: number;
}

const guildBoard: Bounty[] = [
	{ target: 'Grogu', sector: 'Outer Rim', credits: 100_000 },
	{ target: 'Han Solo', sector: 'Outer Rim', credits: 50_000 },
	{ target: 'Mythrol', sector: 'Outer Rim', credits: 5_000 },
	{ target: 'Qi’ra', sector: 'Core Worlds', credits: 80_000 },
	{ target: 'Chewbacca', sector: 'Outer Rim', credits: 15_000 },
];

const pageOf = (sector: Bounty['sector'], page: number, size: number): string[] => {
	return SequenceCollection.from(guildBoard)
		.where((bounty) => bounty.sector === sector)
		.orderByDescending((bounty) => bounty.credits)
		.skip(page * size)
		.take(size)
		.select((bounty) => bounty.target)
		.toArray();
};

console.log(pageOf('Outer Rim', 0, 2)); // ['Grogu', 'Han Solo']
console.log(pageOf('Outer Rim', 1, 2)); // ['Chewbacca', 'Mythrol']
```

### Batching writes

```ts
SequenceCollection.from(records)
	.chunk(500)
	.forEach((batch) => jediArchive.insertMany(batch));
```

Copying the Temple's records to Ilum before the purge, in batches the archive
can take:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface ArchiveRecord {
	shelf: number;
	title: string;
}

const jediArchive = {
	writes: 0,
	insertMany(batch: readonly ArchiveRecord[]): void {
		this.writes++;
		console.log(`Archived shelves ${String(batch[0]?.shelf)}–${String(batch.at(-1)?.shelf)}`);
	},
};

const templeRecords = SequenceCollection.range(1, 1_200).select((shelf) => ({
	shelf,
	title: `Holocron ${String(shelf)}`,
}));

templeRecords.chunk(500).forEach((batch) => jediArchive.insertMany(batch));
// 'Archived shelves 1–500'
// 'Archived shelves 501–1000'
// 'Archived shelves 1001–1200'

console.log(jediArchive.writes); // 3
```

### Detecting gaps in a series

```ts
const gaps = SequenceCollection.from(pings)
	.orderBy((ping) => ping.minute)
	.pairwise()
	.where(([before, after]) => after.minute - before.minute > silence)
	.toArray();
```

Echo Base's perimeter sensors, checked for the minutes a probe droid could have
slipped through:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface SensorPing {
	minute: number;
	post: string;
}

const perimeter: SensorPing[] = [
	{ minute: 12, post: 'North Ridge' },
	{ minute: 3, post: 'Ion Cannon' },
	{ minute: 5, post: 'Shield Generator' },
	{ minute: 21, post: 'North Ridge' },
	{ minute: 14, post: 'Hangar' },
];

const silence = 5;

const blindSpots = SequenceCollection.from(perimeter)
	.orderBy((ping) => ping.minute)
	.pairwise()
	.where(([before, after]) => after.minute - before.minute > silence)
	.select(
		([before, after]) =>
			`No contact from minute ${String(before.minute)} to ${String(after.minute)}`,
	)
	.toArray();

console.log(blindSpots);
// ['No contact from minute 5 to 12', 'No contact from minute 14 to 21']
```

### Splitting valid from invalid, once

```ts
const [cleared, flagged] = SequenceCollection.from(manifests).partition(passesInspection);

await dock(cleared.toArray());
report(flagged.count());
```

An Imperial checkpoint at Mos Eisley, clearing manifests and flagging the rest
in one reading of the queue:

```ts
import { SequenceCollection } from '@fulcro/collections';

interface CargoManifest {
	ship: string;
	declared: string[];
	imperialPermit: boolean;
}

const queue: CargoManifest[] = [
	{ ship: 'Millennium Falcon', declared: ['passengers'], imperialPermit: false },
	{ ship: 'Sandcrawler', declared: ['droids', 'scrap'], imperialPermit: true },
	{ ship: 'Dewback patrol', declared: [], imperialPermit: true },
];

const passesInspection = (manifest: CargoManifest): boolean => manifest.imperialPermit;

const dock = async (manifests: readonly CargoManifest[]): Promise<void> => {
	for (const manifest of manifests) console.log(`Cleared: ${manifest.ship}`);
};

const [cleared, flagged] = SequenceCollection.from(queue).partition(passesInspection);

await dock(cleared.toArray());
// 'Cleared: Sandcrawler'
// 'Cleared: Dewback patrol'

console.log(`${String(flagged.count())} ship flagged for inspection`); // '1 ship flagged for inspection'
```

## A note for bundler configuration

This package is **not** side-effect free and does not declare itself as such.
Its barrels run a composition step on load that plugs the concrete group and
ordered classes into a factory registry. A bundler told to treat it as
side-effect free would drop that step, and `groupBy`, `orderBy` and
`orderByDescending` would fail at runtime.

No configuration is needed — just do not add an override.

## Types

The contracts ship as interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — alongside the delegate types the operators take (`Predicate`,
`Selector`, `Comparer`, `Action`, `ResultSelector`, `Accumulator`). Prefer them
over the concrete classes in your own signatures:

```ts
const activePilots = (pilots: Sequence<RebelPilot>): Sequence<RebelPilot> =>
	pilots.where((pilot) => pilot.active);
```

A small module of a squadron tracker, typed against the contracts so that any
sequence — from an array, a generator or another query — can be handed to it:

```ts
import { SequenceCollection } from '@fulcro/collections';
import type { Group, Predicate, Sequence } from '@fulcro/collections';

interface RebelPilot {
	callSign: string;
	squadron: string;
	active: boolean;
}

const isActive: Predicate<RebelPilot> = (pilot) => pilot.active;

const activePilots = (pilots: Sequence<RebelPilot>): Sequence<RebelPilot> => pilots.where(isActive);

const bySquadron = (pilots: Sequence<RebelPilot>): Sequence<Group<string, RebelPilot>> => {
	return activePilots(pilots).groupBy((pilot) => pilot.squadron);
};

const hothDefense = SequenceCollection.from<RebelPilot>([
	{ callSign: 'Rogue Leader', squadron: 'Rogue', active: true },
	{ callSign: 'Rogue Two', squadron: 'Rogue', active: true },
	{ callSign: 'Rogue Three', squadron: 'Rogue', active: false },
]);

const summary = bySquadron(hothDefense)
	.select((group) => `${group.key}: ${String(group.count())} flying`)
	.toArray();

console.log(summary); // ['Rogue: 2 flying']
```

## Reference

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

Statics: `from`, `empty`, `range`, `repeat`. On an `OrderedSequence`: `thenBy`,
`thenByDescending`.

## Next

- [Async sequences](./async-sequences.md) — the same operators over data that
  arrives over time.
- [Bounded concurrency](./concurrency.md) — running several elements at once.
