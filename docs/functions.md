# Control flow as values: `switchFor`, `tryCatch`, `Result`, `Option` and `equals`

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/functions.md)

Helpers that turn statements into expressions, two types that turn failure and
absence into values, and a comparison of two values by what they hold. No
dependencies, no compiler involvement, nothing to configure.

```sh
npm install @fulcro/functions
```

The types need TypeScript 5.4 or later, which `typescript` is an optional peer
for: on an older one, npm refuses the install with `ERESOLVE`. A project without
TypeScript needs nothing else.

```ts
import {
	createEquals,
	type EqualityRule,
	equals,
	failure,
	none,
	type Option,
	optionOf,
	type Result,
	some,
	success,
	switchFor,
	tryCatch,
} from '@fulcro/functions';
```

## `switchFor`

### The exhaustive form — enums and literal unions

Pass one branch per member, and **the compiler enforces that every member has
one**:

```ts
enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

const label = switchFor(status, {
	[HyperdriveStatus.Online]: () => 'ready to jump',
	[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
	[HyperdriveStatus.Offline]: () => "it's not my fault",
});
```

Leave one out and it does not compile:

```text
error TS2769: No overload matches this call.
  …
      Property '[HyperdriveStatus.Offline]' is missing in type
      '{ 0: () => string; 1: () => string; }' but required in type
      'ExhaustiveCases<HyperdriveStatus, string>'.
```

**That error is the entire point.** Add a member to the enum six months from now
and every `switchFor` over it stops compiling until the new case is handled —
which is the moment to decide what it should do, rather than finding out in
production. A native `switch` says nothing; it just falls through.

There is deliberately **no fallback** in this form. A fallback is precisely what
would absorb the new member in silence and take the guarantee away.

The readiness board of a smugglers' hangar, one line per ship:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

interface Ship {
	name: string;
	hyperdrive: HyperdriveStatus;
}

const hangar: Ship[] = [
	{ name: 'Millennium Falcon', hyperdrive: HyperdriveStatus.Offline },
	{ name: 'Ghost', hyperdrive: HyperdriveStatus.Online },
	{ name: 'Razor Crest', hyperdrive: HyperdriveStatus.Damaged },
];

const readiness = (ship: Ship): string => {
	return switchFor(ship.hyperdrive, {
		[HyperdriveStatus.Online]: () => `${ship.name}: ready to jump`,
		[HyperdriveStatus.Damaged]: () => `${ship.name}: jump at your own risk`,
		[HyperdriveStatus.Offline]: () => `${ship.name}: it's not my fault`,
	});
};

console.log(hangar.map(readiness));
// ["Millennium Falcon: it's not my fault", 'Ghost: ready to jump', 'Razor Crest: jump at your own risk']
```

Each branch receives the single member it handles, already narrowed:

```ts
switchFor(status, {
	[HyperdriveStatus.Damaged]: (value) => {
		const damaged: HyperdriveStatus.Damaged = value; // not HyperdriveStatus
		return scheduleRepair(damaged);
	},
	// …
});
```

The narrowed member, passed on to a function that only accepts that one:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

// Only a damaged hyperdrive can be booked into Chewbacca's repair bay.
const scheduleRepair = (status: HyperdriveStatus.Damaged): string => {
	return `Repair bay booked (status ${String(status)}): Chewie has the hydrospanner`;
};

const nextStep = (status: HyperdriveStatus): string => {
	return switchFor(status, {
		[HyperdriveStatus.Online]: () => 'Punch it',
		[HyperdriveStatus.Damaged]: (value) => {
			const damaged: HyperdriveStatus.Damaged = value;

			return scheduleRepair(damaged);
		},
		[HyperdriveStatus.Offline]: () => 'Find a new motivator',
	});
};

console.log(nextStep(HyperdriveStatus.Damaged)); // 'Repair bay booked (status 1): Chewie has the hydrospanner'
console.log(nextStep(HyperdriveStatus.Online)); // 'Punch it'
```

Works with numeric enums, string enums, and unions of string or number literals:

```ts
const blade = switchFor(side, {
	light: () => '🔵',
	dark: () => '🔴',
});
```

A member whose value is `0` dispatches like any other — the branch is found by
key, never by testing the value for truthiness.

A literal union, and an enum whose first member is `0`:

```ts
import { switchFor } from '@fulcro/functions';

type Side = 'light' | 'dark';

enum Rank {
	Youngling,
	Padawan,
	Knight,
	Master,
}

interface ForceUser {
	name: string;
	side: Side;
	rank: Rank;
}

const describe = (user: ForceUser): string => {
	const blade = switchFor(user.side, {
		light: () => 'blue',
		dark: () => 'red',
	});

	const title = switchFor(user.rank, {
		[Rank.Youngling]: () => 'Youngling',
		[Rank.Padawan]: () => 'Padawan',
		[Rank.Knight]: () => 'Jedi Knight',
		[Rank.Master]: () => 'Master',
	});

	return `${title} ${user.name}, ${blade} blade`;
};

console.log(describe({ name: 'Grogu', side: 'light', rank: Rank.Youngling })); // 'Youngling Grogu, blue blade'
console.log(describe({ name: 'Kylo Ren', side: 'dark', rank: Rank.Knight })); // 'Jedi Knight Kylo Ren, red blade'
```

### Running it for its effects

There is no separate void-returning function, and none is needed:

```ts
switchFor(alert, {
	[Alert.Green]: () => resumePatrols(),
	[Alert.Yellow]: () => scrambleSnowspeeders(),
	[Alert.Red]: () => evacuateEchoBase(),
});
```

The exhaustiveness check applies here exactly as it does to a call whose result
is read.

Echo Base's alert panel, where each level does something rather than returning
something:

```ts
import { switchFor } from '@fulcro/functions';

enum Alert {
	Green,
	Yellow,
	Red,
}

const orders: string[] = [];

const resumePatrols = (): void => {
	orders.push('Tauntaun patrols resume');
};

const scrambleSnowspeeders = (): void => {
	orders.push('Rogue Squadron to the snowspeeders');
};

const evacuateEchoBase = (): void => {
	orders.push('Begin evacuation — transports first');
};

const raise = (alert: Alert): void => {
	switchFor(alert, {
		[Alert.Green]: () => resumePatrols(),
		[Alert.Yellow]: () => scrambleSnowspeeders(),
		[Alert.Red]: () => evacuateEchoBase(),
	});
};

raise(Alert.Yellow);
raise(Alert.Red);

console.log(orders); // ['Rogue Squadron to the snowspeeders', 'Begin evacuation — transports first']
```

### The predicate form — everything else

Where branches are conditions rather than values:

```ts
const size = switchFor(
	ship,
	[
		{ when: (s) => s.crew > 1000, then: () => 'capital ship' },
		{ when: (s) => s.hyperdriveClass === null, then: () => 'sublight only' },
	],
	() => 'starfighter',
);
```

Branches are tested in order, the first match wins, and the rest are never
evaluated — neither their conditions nor their bodies.

`otherwise` is optional, and leaving it out shows up in the type rather than
being hidden:

```ts
const a = switchFor(ship, cases); // string | undefined
const b = switchFor(ship, cases, () => 'starfighter'); // string
```

This form **cannot** be exhaustive. A condition is an arbitrary function, and the
compiler cannot reason about which values it accepts — which is why it takes a
fallback and the exhaustive form does not.

A fleet registry sorting ships into classes, with and without a fallback, and
counting the conditions it actually evaluated:

```ts
import { type SwitchCase, switchFor } from '@fulcro/functions';

interface Ship {
	name: string;
	crew: number;
	hyperdriveClass: number | null;
}

let conditionsTested = 0;

const cases: SwitchCase<Ship, string>[] = [
	{
		when: (ship) => (conditionsTested++, ship.crew > 1000),
		then: () => 'capital ship',
	},
	{
		when: (ship) => (conditionsTested++, ship.hyperdriveClass === null),
		then: () => 'sublight only',
	},
];

const fleet: Ship[] = [
	{ name: 'Executor', crew: 279_144, hyperdriveClass: 2 },
	{ name: 'TIE fighter', crew: 1, hyperdriveClass: null },
	{ name: 'X-wing', crew: 1, hyperdriveClass: 1 },
];

const classes = fleet.map((ship) => `${ship.name}: ${switchFor(ship, cases, () => 'starfighter')}`);

console.log(classes); // ['Executor: capital ship', 'TIE fighter: sublight only', 'X-wing: starfighter']
console.log(conditionsTested); // 5 — the Executor's second condition was never evaluated

const unclassified: string | undefined = switchFor(fleet[2], cases);

console.log(unclassified); // undefined — no fallback, and the type says so
```

### Why bother

Because the alternative is a nested ternary or a mutable `let`:

```ts
// What it replaces.
let label: string;

switch (status) {
	case HyperdriveStatus.Online:
		label = 'ready to jump';
		break;
	// …forget a case and nothing complains
}
```

A native `switch` is a statement, so it cannot initialise a `const`, cannot be
the body of an arrow function, and cannot sit inside an object literal or a JSX
attribute. `switchFor` can.

The pre-flight report a ship's computer hands the pilot, built as one object
literal — the place a `switch` cannot go:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

interface PreflightReport {
	ship: string;
	hyperdrive: string;
	canJump: boolean;
}

const preflight = (ship: string, status: HyperdriveStatus): PreflightReport => ({
	ship,
	hyperdrive: switchFor(status, {
		[HyperdriveStatus.Online]: () => 'ready to jump',
		[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
		[HyperdriveStatus.Offline]: () => "it's not my fault",
	}),
	canJump: status !== HyperdriveStatus.Offline,
});

console.log(preflight('Millennium Falcon', HyperdriveStatus.Offline));
// { ship: 'Millennium Falcon', hyperdrive: "it's not my fault", canJump: false }
```

## `Result`

The outcome of an operation, as a value: either a **success** carrying the
value it produced, or a **failure** carrying the error it failed with.

```ts
const jump: Result<number, string> = Number.isNaN(parsecs)
	? failure('not a coordinate')
	: success(parsecs);
```

|           | `value` | `error`          |
| --------- | ------- | ---------------- |
| `Success` | `T`     | `null`           |
| `Failure` | `null`  | `NonNullable<E>` |

A navicomputer parsing the distances typed into it, every outcome a value:

```ts
import { failure, type Result, success } from '@fulcro/functions';

const parseParsecs = (input: string): Result<number, string> => {
	const parsecs = Number(input);

	if (Number.isNaN(parsecs)) return failure(`'${input}' is not a coordinate`);
	if (parsecs <= 0) return failure('a jump needs a distance');

	return success(parsecs);
};

console.log(parseParsecs('12').value); // 12 — the Kessel Run, in less than twelve
console.log(parseParsecs('Kessel').error); // "'Kessel' is not a coordinate"
console.log(parseParsecs('0').error); // 'a jump needs a distance'
```

### Handle both variants with `handle`

```ts
const message = jump.handle({
	success: (value) => `plotted ${value} parsecs`,
	failure: (error) => `cannot jump: ${error}`,
});
```

Both branches are required, and **leaving one out does not compile**:

```text
error TS2345: Argument of type '{ success: (value: number) => string; }' is not
assignable to parameter of type 'ResultCases<number, string, unknown>'.
  Property 'failure' is missing in type '{ success: (value: number) => string; }'
  but required in type 'ResultCases<number, string, unknown>'.
```

Only the branch for the variant at hand runs. Naming a third branch does not
compile either.

The navicomputer's display, one message for every outcome:

```ts
import { failure, type Result, success } from '@fulcro/functions';

const parseParsecs = (input: string): Result<number, string> => {
	const parsecs = Number(input);

	return Number.isNaN(parsecs) ? failure(`'${input}' is not a coordinate`) : success(parsecs);
};

const display = (input: string): string => {
	return parseParsecs(input).handle({
		success: (value) => `Plotted: ${String(value)} parsecs`,
		failure: (error) => `Cannot jump: ${error}`,
	});
};

console.log(display('12')); // 'Plotted: 12 parsecs'
console.log(display('Dagobah')); // "Cannot jump: 'Dagobah' is not a coordinate"
```

### Or narrow first

```ts
if (jump.isSuccess()) {
	jump.value; // number, not number | null
}

if (jump.isFailure()) {
	jump.error; // string
}
```

`error === null` narrows the same way, and it is the check to reach for on a
result that has been copied — through `structuredClone`, across a worker, or
through JSON. A copy keeps the data of a result, but not the methods it
inherits.

A course computed on one ship and sent to another: the original narrows with its
methods, the copy with `error === null`:

```ts
import { type Result, success } from '@fulcro/functions';

const course: Result<number, string> = success(12);

if (course.isSuccess()) {
	console.log(course.value + 1); // 13 — `value` is a number here
}

// Sent over the comm link, the result arrives as its data, without the methods.
const received: Result<number, string> = structuredClone(course);

console.log(typeof received.isSuccess); // 'undefined'

if (received.error === null) {
	console.log(`Course received: ${String(received.value)} parsecs`); // 'Course received: 12 parsecs'
}
```

### Discriminate on the variant, never on `value`

`0`, `''` and `null` are perfectly good values, and `if (result.value)` reports
every one of them as a failure. `isSuccess()`, `isFailure()` and
`error === null` have no such trap.

A failure's error is never `null` or `undefined` — `failure(null)` does not
compile — because a failure whose error is `null` would read as a success.

## `tryCatch`

Runs an operation and returns its outcome as a [`Result`](#result), instead of
throwing:

```ts
const result = await tryCatch(() => hailRebelBase(frequency));

if (result.isFailure()) return fallback;

use(result.value);
```

A transmitter that throws when the Empire jams the frequency, turned into a
value the caller can decide about:

```ts
import { tryCatch } from '@fulcro/functions';

const jammed = new Set([1138]);

const hailRebelBase = async (frequency: number): Promise<string> => {
	await new Promise((resolve) => setTimeout(resolve, 5));

	if (jammed.has(frequency)) throw new Error(`frequency ${String(frequency)} is jammed`);

	return 'Echo Base here — go ahead, Rogue Leader';
};

const contact = async (frequency: number): Promise<string> => {
	const result = await tryCatch(() => hailRebelBase(frequency));

	if (result.isFailure())
		return `No answer (${(result.error as Error).message}); switching to the backup channel`;

	return result.value;
};

console.log(await contact(1977)); // 'Echo Base here — go ahead, Rogue Leader'
console.log(await contact(1138)); // 'No answer (frequency 1138 is jammed); switching to the backup channel'
```

### Prefer the callback form

```ts
await tryCatch(() => openBlastDoors(code)); // ✓ catches everything
await tryCatch(openBlastDoors(code)); // ✗ misses a synchronous throw
```

In the second form, `openBlastDoors` runs **before** `tryCatch` does, so anything
it throws on its way to producing a promise escapes entirely. The callback form
moves that call inside the `try`, which is the only way to cover both the
synchronous and the asynchronous failure of one operation.

The promise form is still accepted, and reads better when the promise is already
in hand.

The Death Star's blast doors, which refuse a wrong code before any promise
exists — and what each form makes of that:

```ts
import { tryCatch } from '@fulcro/functions';

const openBlastDoors = (code: string): Promise<string> => {
	if (code !== 'THX-1138') throw new Error('access denied');

	return Promise.resolve('Blast doors open');
};

const caught = await tryCatch(() => openBlastDoors('TK-421'));

console.log(caught.isFailure()); // true — the synchronous throw became a value

let escaped = false;

try {
	await tryCatch(openBlastDoors('TK-421'));
} catch {
	escaped = true;
}

console.log(escaped); // true — it threw before tryCatch was even called

const opened = await tryCatch(openBlastDoors('THX-1138'));

console.log(opened.value); // 'Blast doors open' — fine when the promise is already in hand
```

### `E` defaults to `unknown`, not `Error`

JavaScript lets any value be thrown. Typing the error as an `Error` would be a
claim the function cannot keep — `result.error.message` would read `undefined`
whenever something threw a string. So narrow at the use site, or name the type
when you own every throw site:

```ts
const result = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load(callSign));
```

A thrown `null` or `undefined` — legal, however pathological — is wrapped in an
`Error` carrying the original as its `cause`
([`FULCRO2001`](./errors/FULCRO2xxx.md#fulcro2001)), because storing it as it
came would make the failure indistinguishable from a success.

An archive that owns every one of its throw sites, and says so in the type:

```ts
import { tryCatch } from '@fulcro/functions';

interface Pilot {
	callSign: string;
	name: string;
}

class ArchiveError extends Error {
	constructor(readonly callSign: string) {
		super(`no pilot on file as ${callSign}`);
	}
}

const pilots = new Map([['Red Five', { callSign: 'Red Five', name: 'Luke Skywalker' }]]);

const rebelArchive = {
	load: async (callSign: string): Promise<Pilot> => {
		const pilot = pilots.get(callSign);

		if (pilot === undefined) throw new ArchiveError(callSign);

		return pilot;
	},
};

const result = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load('Red Six'));

if (result.isFailure()) {
	console.log(result.error.callSign); // 'Red Six' — typed, because every throw site is ours
}

const thrownNothing = await tryCatch(() => {
	throw undefined;
});

console.log((thrownNothing.error as Error).message.startsWith('FULCRO2001')); // true
```

### Where you actually use it

```ts
// Several independent things, where one failing should not stop the rest.
const [plans, fleet, intelligence] = await Promise.all([
	tryCatch(() => loadDeathStarPlans()),
	tryCatch(() => loadFleetPositions()),
	tryCatch(() => loadBothanReports()),
]);

brief({
	plans: plans.value,
	fleet: fleet.handle({ success: (ships) => ships, failure: () => [] }),
});
```

```ts
// A boundary where a throw would be worse than a value.
const parsed = await tryCatch(async () => JSON.parse(body));

if (parsed.isFailure()) return reply.status(400).send('garbled transmission');
```

Mon Mothma's briefing before Endor, assembled from three sources where one
failing must not cancel the briefing:

```ts
import { tryCatch } from '@fulcro/functions';

const loadDeathStarPlans = async (): Promise<string> => 'Shield generator on the forest moon';

const loadFleetPositions = async (): Promise<string[]> => {
	throw new Error('Sullust relay is down');
};

const loadBothanReports = async (): Promise<number> => 3;

const [plans, fleet, intelligence] = await Promise.all([
	tryCatch(() => loadDeathStarPlans()),
	tryCatch(() => loadFleetPositions()),
	tryCatch(() => loadBothanReports()),
]);

const briefing = {
	plans: plans.value,
	fleet: fleet.handle({ success: (ships) => ships, failure: () => [] }),
	reports: intelligence.value ?? 0,
};

console.log(briefing); // { plans: 'Shield generator on the forest moon', fleet: [], reports: 3 }
```

And the comm relay at Mos Eisley, which must answer a garbled transmission with
a status rather than crash:

```ts
import { tryCatch } from '@fulcro/functions';

interface Reply {
	code: number;
	body: string;
}

const relay = async (body: string): Promise<Reply> => {
	const parsed = await tryCatch(async (): Promise<{ to: string }> => JSON.parse(body));

	if (parsed.isFailure()) return { code: 400, body: 'garbled transmission' };

	return { code: 200, body: `relayed to ${parsed.value.to}` };
};

console.log(await relay('{ "to": "Tantive IV" }')); // { code: 200, body: 'relayed to Tantive IV' }
console.log(await relay('help me obi-wan')); // { code: 400, body: 'garbled transmission' }
```

### Collecting failures across a batch

It composes with the other packages rather than needing a mode of its own:

```ts
const outcomes = await AsyncSequenceCollection.from(callSigns)
	.selectAwait((callSign) => tryCatch(() => rebelArchive.load(callSign)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);
```

Every element is attempted, nothing stops early, and you get both halves.

`tryCatch` always returns a promise, including for a fully synchronous
operation.

Loading every pilot of a squadron roster, with the call signs the archive has
never heard of kept apart rather than stopping the load:

```ts
import { SequenceCollection } from '@fulcro/collections';
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { tryCatch } from '@fulcro/functions';

const pilots = new Map([
	['Red Two', 'Wedge Antilles'],
	['Red Five', 'Luke Skywalker'],
	['Gold Leader', 'Lando Calrissian'],
]);

const rebelArchive = {
	load: async (callSign: string): Promise<string> => {
		await new Promise((resolve) => setTimeout(resolve, 5));

		const name = pilots.get(callSign);

		if (name === undefined) throw new Error(`${callSign} is not on file`);

		return name;
	},
};

const callSigns = ['Red Two', 'Red Six', 'Red Five', 'Gold Leader'];

const outcomes = await AsyncSequenceCollection.from(callSigns)
	.selectAwait((callSign) => tryCatch(() => rebelArchive.load(callSign)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);

console.log(loaded.select((outcome) => outcome.value).toArray()); // ['Wedge Antilles', 'Luke Skywalker', 'Lando Calrissian']
console.log(failed.select((outcome) => (outcome.error as Error).message).toArray()); // ['Red Six is not on file']
```

## `Option`

A value that may be absent, as a value of its own rather than as `null`:
either **some** value, or **none**.

```ts
const hyperdrive: Option<number> = some(0.5);
const noHyperdrive: Option<number> = none();
```

Most options come from a value that may be `null` or `undefined`, and
`optionOf` turns one into the other:

```ts
const ship: Option<Starship> = optionOf(registry.get(registryNumber));
```

Only `null` and `undefined` are absent. `0`, `''` and `false` are present —
each is a value somebody meant.

The port authority's registry, where a missing ship is a value and a ship with
a crew of zero is not missing:

```ts
import { none, type Option, optionOf, some } from '@fulcro/functions';

interface Starship {
	name: string;
	crew: number;
}

const registry = new Map<string, Starship>([
	['YT-1300 492727ZED', { name: 'Millennium Falcon', crew: 2 }],
	['ST-70 Razor Crest', { name: 'Razor Crest', crew: 1 }],
	['B-wing derelict', { name: 'Derelict B-wing', crew: 0 }],
]);

const hyperdrive: Option<number> = some(0.5);
const noHyperdrive: Option<number> = none();

const falcon = optionOf(registry.get('YT-1300 492727ZED'));
const phantom = optionOf(registry.get('TIE/x1 Vader'));
const crewOfDerelict = optionOf(registry.get('B-wing derelict')?.crew);

console.log(hyperdrive.isSome(), noHyperdrive.isNone()); // true true
console.log(falcon.isSome()); // true
console.log(phantom.isNone()); // true
console.log(crewOfDerelict.isSome(), crewOfDerelict.value); // true 0 — zero is a value somebody meant
```

### Handle a present and an absent value with `handle`

```ts
const greeting = ship.handle({
	some: (found) => `Welcome aboard the ${found.name}`,
	none: () => 'No such ship docked here',
});
```

As with `Result`, both branches are required and leaving one out does not
compile. Only the branch for the variant at hand runs.

### Or narrow to the present value

```ts
if (ship.isSome()) {
	ship.value; // Starship, not Starship | null
}
```

The docking terminal at Cloud City, greeting arrivals by registry:

```ts
import { optionOf } from '@fulcro/functions';

interface Starship {
	name: string;
	captain: string;
}

const landingPads = new Map<string, Starship>([
	['Pad 7', { name: 'Millennium Falcon', captain: 'Han Solo' }],
	['Pad 9', { name: 'Slave I', captain: 'Boba Fett' }],
]);

const greet = (pad: string): string => {
	return optionOf(landingPads.get(pad)).handle({
		some: (found) => `Welcome to Cloud City, Captain ${found.captain} of the ${found.name}`,
		none: () => `${pad} is empty`,
	});
};

console.log(greet('Pad 7')); // 'Welcome to Cloud City, Captain Han Solo of the Millennium Falcon'
console.log(greet('Pad 3')); // 'Pad 3 is empty'

const onPadNine = optionOf(landingPads.get('Pad 9'));

if (onPadNine.isSome()) {
	console.log(onPadNine.value.captain); // 'Boba Fett' — a Starship here, not Starship | null
}
```

### `some(null)` is not `none()`

`some(null)` is a present value that happens to be `null`, and it has exactly
the same data as `none()`. Only the variant tells them apart, so `isSome()` and
`isNone()` are the check — `value` is not. `some` keeps whatever it is given;
reading `null` as absent is `optionOf`'s job.

## `equals`

Tells whether two values hold the same thing — two objects with the same keys
and equal values, two arrays with equal elements — where `===` only tells
whether they are the same object.

```ts
equals(
	{ system: 'Hoth', waypoints: ['Ord Mantell'] },
	{ system: 'Hoth', waypoints: ['Ord Mantell'] },
); // true
equals(['Hoth', 'Bespin', 'Endor'], ['Hoth', 'Endor', 'Bespin']); // false
```

`right` takes its type from `left`, so two values that could never be equal do
not compile: `equals(1, 'one')` is refused.

Two astromechs computing the same flight plan independently, and the navigator
checking they agree before the jump:

```ts
import { equals } from '@fulcro/functions';

interface FlightPlan {
	destination: string;
	waypoints: string[];
	jumpAt: Date;
}

const fromR2D2: FlightPlan = {
	destination: 'Dagobah',
	waypoints: ['Hoth', 'Anoat'],
	jumpAt: new Date(0),
};

const fromChopper: FlightPlan = {
	jumpAt: new Date(0),
	waypoints: ['Hoth', 'Anoat'],
	destination: 'Dagobah',
};

console.log(fromR2D2 === fromChopper); // false — two objects
console.log(equals(fromR2D2, fromChopper)); // true — the same plan, keys in any order
console.log(equals(fromR2D2, { ...fromChopper, waypoints: ['Anoat', 'Hoth'] })); // false — order matters in an array
console.log(equals(Number.NaN, Number.NaN)); // true — a value always equals itself
```

### What is compared by contents, and what by identity

A value always equals itself. Two distinct values are compared by what they
hold when they are of a kind defined by its contents, and are unequal
otherwise:

| Values                                                                     | Equal when                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Primitives                                                                 | They are the same value; `NaN` equals `NaN`, `0` equals `-0`            |
| Objects of different prototypes                                            | Never                                                                   |
| Plain objects, with or without a prototype                                 | They have the same own enumerable keys, in any order, with equal values |
| Arrays                                                                     | They are as long, with equal elements; a hole reads as `undefined`      |
| `Result` and `Option`                                                      | They are the same variant, with equal fields                            |
| `Date`                                                                     | They hold the same time                                                 |
| `Map`                                                                      | They hold the same keys, with equal values                              |
| `Set`                                                                      | They hold the same elements                                             |
| `ArrayBuffer`, `DataView`                                                  | Their bytes are equal                                                   |
| Typed arrays                                                               | They are of one kind, with equal elements                               |
| Anything else: an instance of a class, an `Error`, a `RegExp`, a `Promise` | Never — it is defined by which object it is                             |

Primitives compare as a `Set` finds them, so `equals` always says a value equals
itself — `NaN` included. That is a different question from the one
`NumericType.equals` of `@fulcro/types` answers, where `NaN` equals nothing:
that one is arithmetic, and this one is what a key, a cache or a list without
duplicates needs.

`some(null)` and `none()` hold exactly the same data, and are not equal: the
variant is compared before the fields. A `failure` holding an `Error` equals
another only when both hold the same error, since an error is an instance of a
class.

**An instance of a class equals only itself.** A class may keep its state where
no comparison can read it — `Decimal` keeps its digits in private fields — so
comparing its own keys would find none and call any two instances equal. To
compare one by what it holds, give it a rule; see below.

**A key of a `Map` and an element of a `Set` are found by identity**, as the map
and the set find them, never by contents. That is what keeps comparing two maps
linear: matching every key against every other would cost a comparison per
pair.

Two structures that refer to themselves — a ring, a tree whose node holds its
parent — are equal when nothing else in them differs, and are compared once
round.

### Values of `@fulcro/types`

A struct, a matrix, a fraction, a complex number: each is a value type, and
`equals` reads it as the plain object or array it is. That is right for many of
them and not for all — a matrix of two rows and three columns holds the same
six elements as one of three rows and two, and its shape is not one of its
keys. The descriptor knows the type; hand it to [`createEquals`](#your-own-rules-createequals)
as a rule:

```ts
const sameShape = createEquals([Formation, Column]); // Matrix(DoublePrecisionFloat, 2, 3) and (…, 3, 2)

equals<unknown>(formation, column); // true: the same six numbers
sameShape<unknown>(formation, column); // false: each is recognised by its own descriptor
```

The two matrices are of different types, which `equals` refuses to compare
unless the call names the type it is made at — here `unknown`.

A struct passed as a rule is never equal to a plain object that merely has its
fields, and each of its fields compares as its own type does.

Two readouts of the same six fighters' shield strengths — one laid out as the
attack formation, one as the column they flew in:

```ts
import { createEquals, equals } from '@fulcro/functions';
import { DoublePrecisionFloat, Matrix } from '@fulcro/types';

// Rows are the wings, columns the fighters in each wing.
const Formation = Matrix(DoublePrecisionFloat, 2, 3);
const Column = Matrix(DoublePrecisionFloat, 3, 2);

const attackFormation = Formation.from([
	[100, 80, 65],
	[90, 70, 55],
]);

const inColumn = Column.from([
	[100, 80],
	[65, 90],
	[70, 55],
]);

const sameShape = createEquals([Formation, Column]);

// Of different types, so each comparison is made at `unknown`.
console.log(equals<unknown>(attackFormation, inColumn)); // true — the same six readings, read as arrays
console.log(sameShape<unknown>(attackFormation, inColumn)); // false — a formation is not a column
```

### Your own rules: `createEquals`

`createEquals` makes a variant of `equals` that compares some kinds of value by
rules of your own. A rule recognises its values with `is` and compares two of
them with `equals`:

```ts
const byCallSign: EqualityRule<Pilot> = {
	is: (value): value is Pilot => value instanceof Pilot,
	equals: (left, right) => left.callSign === right.callSign,
};

const sameRoster = createEquals([byCallSign]);

sameRoster([wedge], [wedgeAfterPromotion]); // true: the arrays as `equals` compares them, the pilots by call sign
```

Two rosters of Red Squadron, one taken before Wedge's promotion and one after —
the same pilots, by call sign:

```ts
import { createEquals, type EqualityRule, equals } from '@fulcro/functions';

class Pilot {
	constructor(
		readonly callSign: string,
		readonly rank: string,
	) {}
}

const byCallSign: EqualityRule<Pilot> = {
	is: (value): value is Pilot => value instanceof Pilot,
	equals: (left, right) => left.callSign === right.callSign,
};

const sameRoster = createEquals([byCallSign]);

const beforeHoth = [new Pilot('Red Two', 'Lieutenant'), new Pilot('Red Five', 'Commander')];
const afterHoth = [new Pilot('Red Two', 'Commander'), new Pilot('Red Five', 'Commander')];

console.log(equals(beforeHoth, afterHoth)); // false — instances of a class equal only themselves
console.log(sameRoster(beforeHoth, afterHoth)); // true — the same call signs, in the same order
```

The descriptor of every type of `@fulcro/types` already is a rule, since each
has `is` and `equals`. `Decimal` compares through its values, so its rule is
written out:

```ts
const byValue: EqualityRule<Decimal> = {
	is: Decimal.is,
	equals: (left, right) => left.equals(right),
};
```

Two ledgers of the same bounty payments, one written with trailing zeros:

```ts
import { createEquals, type EqualityRule, equals } from '@fulcro/functions';
import { Decimal } from '@fulcro/types';

const byValue: EqualityRule<Decimal> = {
	is: Decimal.is,
	equals: (left, right) => left.equals(right),
};

const sameLedger = createEquals([byValue]);

const guildLedger = [Decimal.from('50000.00'), Decimal.from('15000.50')];
const huttLedger = [Decimal.from('50000'), Decimal.from('15000.5')];

console.log(equals(guildLedger, huttLedger)); // false — each Decimal is a distinct instance
console.log(sameLedger(guildLedger, huttLedger)); // true — the same amounts
```

Two values are compared in this order:

1. A value always equals itself, whatever a rule would say.
2. The first rule that recognises either value decides: with its `equals` when
   it recognises both, and as unequal when it recognises only one. The rules
   after it are not asked.
3. Otherwise, as `equals` compares them.

So a rule can also take over a kind `equals` already compares — dates by the
day, strings without regard to case.

A rule whose values hold others compares them with the third argument, the
variant it belongs to. It keeps track of what is already being compared, so a
structure that refers to itself is still compared once round:

```ts
const byName: EqualityRule<Lineage> = {
	is: (value): value is Lineage => value instanceof Lineage,
	equals: (left, right, nested) => {
		return left.name === right.name && nested(left.apprentices, right.apprentices);
	},
};
```

The Jedi lineage as two archives recorded it — the same masters and apprentices,
one archive noting the ranks they held at the time:

```ts
import { createEquals, type EqualityRule } from '@fulcro/functions';

class Lineage {
	constructor(
		readonly name: string,
		readonly rank: string,
		readonly apprentices: Lineage[],
	) {}
}

const byName: EqualityRule<Lineage> = {
	is: (value): value is Lineage => value instanceof Lineage,
	equals: (left, right, nested) => {
		return left.name === right.name && nested(left.apprentices, right.apprentices);
	},
};

const sameLineage = createEquals([byName]);

const templeArchive = new Lineage('Qui-Gon Jinn', 'Master', [
	new Lineage('Obi-Wan Kenobi', 'Master', [new Lineage('Anakin Skywalker', 'Knight', [])]),
]);

const holocronOfIlum = new Lineage('Qui-Gon Jinn', 'Master', [
	new Lineage('Obi-Wan Kenobi', 'Padawan', [new Lineage('Anakin Skywalker', 'Padawan', [])]),
]);

console.log(sameLineage(templeArchive, holocronOfIlum)); // true — the same names, all the way down
```

The rules and their members are read once, when the variant is made: changing
the list afterwards changes nothing. A rule may be an instance of a class; its
members are called on it. A rule that throws makes the comparison throw.

`createEquals` refuses what is not an array of rules
([`FULCRO2002`](./errors/FULCRO2xxx.md#fulcro2002)), and a rule whose `is` or
`equals` is not a function ([`FULCRO2003`](./errors/FULCRO2xxx.md#fulcro2003)).

### What a comparison costs

Each value is read once on each side, and the comparison stops at the first
difference: two arrays of a hundred thousand elements that differ at the
eleventh are read eleven elements deep. Nothing of a value compared with itself
is read at all. A map or a set is compared with one lookup per entry. A rule is
asked about a pair at most once per value, and the rules after the one that
recognised it are not asked.

## What a value costs

A `Result` or an `Option` is one frozen object carrying its data and nothing
else — `value` and `error`, or `value` alone. The methods are inherited from a
prototype each variant shares, so they cost nothing per value and stay out of a
spread, a `for…in` and a deep equality. `none()` always returns the same
object, so absence allocates nothing at all.

## Reference

|                                       |                                                                |
| ------------------------------------- | -------------------------------------------------------------- |
| `switchFor(value, cases)`             | Exhaustive. One branch per member, no fallback.                |
| `switchFor(value, cases, otherwise)`  | Predicate form, returning `R`.                                 |
| `switchFor(value, cases)`             | Predicate form without a fallback, returning `R \| undefined`. |
| `success(value)`                      | A `Result` that succeeded.                                     |
| `failure(error)`                      | A `Result` that failed. `error` is never nullish.              |
| `result.handle({ success, failure })` | Runs the branch of the variant. Both are required.             |
| `result.isSuccess()`, `isFailure()`   | Narrow the result.                                             |
| `tryCatch(callback)`                  | Catches synchronous and asynchronous failures.                 |
| `tryCatch(promise)`                   | Catches only the rejection.                                    |
| `some(value)`                         | An `Option` holding a value, whatever it is.                   |
| `none()`                              | The absent `Option`. Always the same object.                   |
| `optionOf(value)`                     | `none()` for `null` or `undefined`, `some(value)` otherwise.   |
| `option.handle({ some, none })`       | Runs the branch of the variant. Both are required.             |
| `option.isSome()`, `isNone()`         | Narrow the option.                                             |
| `equals(left, right)`                 | Compares by contents; any other object by identity.            |
| `createEquals(rules)`                 | A variant of `equals` that asks the rules first.               |

Types: `SwitchCase`, `ExhaustiveCases`, `Result`, `Success`, `Failure`,
`ResultCases`, `Option`, `Some`, `None`, `OptionCases`, `Equals`,
`EqualityRule`.
