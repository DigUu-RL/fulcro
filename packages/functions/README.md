# @fulcro/functions

Runtime helpers that turn control flow into values, two types that turn failure
and absence into values, and a comparison of two values by what they hold. No
dependencies, no compiler involvement, nothing to configure. The types need
TypeScript 5.4 or later.

```ts
import {
	createEquals,
	equals,
	failure,
	none,
	optionOf,
	some,
	success,
	switchFor,
	tryCatch,
} from '@fulcro/functions';
```

## `switchFor`

Choosing between branches, as an expression rather than as a statement. It comes
in two forms, and which one to reach for depends on whether the value is drawn
from a closed set.

### Exhaustive form — enums and literal unions

Pass one branch per member, and the compiler enforces that every member has one.

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

Leave a member out and it does not compile:

```text
error TS2769: No overload matches this call.
  …
      Property '[HyperdriveStatus.Offline]' is missing in type
      '{ 0: () => string; 1: () => string; }' but required in type
      'ExhaustiveCases<HyperdriveStatus, string>'.
```

**That error is the whole point.** When a member is added to the enum later,
every `switchFor` over it stops compiling until the new case is handled — which
is the moment to decide what it should do, rather than finding the gap in
production. A native `switch` says nothing in that situation; it just falls
through.

There is deliberately **no fallback parameter** in this form. A fallback is
precisely what would absorb the new member in silence and take the guarantee
away.

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

Works with numeric enums, string enums, and unions of string or number
literals. A member whose value is `0` is dispatched like any other — the branch
is found by key, never by testing the value for truthiness.

The hangar at Echo Base, every ship's hyperdrive read out before the evacuation,
and the damaged one booked into Chewbacca's repair bay:

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

// Only a damaged hyperdrive can be booked into the repair bay.
const scheduleRepair = (status: HyperdriveStatus.Damaged): string => {
	return `repair bay booked (status ${String(status)})`;
};

const readiness = (ship: Ship): string => {
	return switchFor(ship.hyperdrive, {
		[HyperdriveStatus.Online]: () => `${ship.name}: ready to jump`,
		[HyperdriveStatus.Damaged]: (value) => {
			const damaged: HyperdriveStatus.Damaged = value;

			return `${ship.name}: ${scheduleRepair(damaged)}`;
		},
		[HyperdriveStatus.Offline]: () => `${ship.name}: it's not my fault`,
	});
};

console.log(hangar.map(readiness));
// ["Millennium Falcon: it's not my fault", 'Ghost: ready to jump', 'Razor Crest: repair bay booked (status 1)']
```

### Running it for its effects

There is no separate void-returning function, and none is needed. Where the
branches return nothing, `R` is inferred as `void` and the call stands on its
own as a statement:

```ts
switchFor(status, {
	[HyperdriveStatus.Online]: () => punchIt(),
	[HyperdriveStatus.Damaged]: () => callChewie(),
	[HyperdriveStatus.Offline]: () => kickThePanel(),
});
```

The exhaustiveness check applies there exactly as it does to a call whose result
is read — leave a member out and this fails to compile too.

The Falcon's cockpit, escaping Hoth with a hyperdrive that will not engage, the
log written by the branches themselves:

```ts
import { switchFor } from '@fulcro/functions';

enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

const cockpitLog: string[] = [];

const punchIt = (): void => {
	cockpitLog.push('Punch it!');
};

const callChewie = (): void => {
	cockpitLog.push('Chewie, take the professor in the back and plug him into the hyperdrive.');
};

const kickThePanel = (): void => {
	cockpitLog.push('*thump*');
};

const attemptJump = (status: HyperdriveStatus): void => {
	switchFor(status, {
		[HyperdriveStatus.Online]: () => punchIt(),
		[HyperdriveStatus.Damaged]: () => callChewie(),
		[HyperdriveStatus.Offline]: () => kickThePanel(),
	});
};

attemptJump(HyperdriveStatus.Offline);
attemptJump(HyperdriveStatus.Damaged);
attemptJump(HyperdriveStatus.Online);

console.log(cockpitLog.length); // 3
console.log(cockpitLog[0]); // '*thump*'
console.log(cockpitLog[2]); // 'Punch it!'
```

### Predicate form — everything else

Where branches are conditions rather than values:

```ts
const threat = switchFor(
	contact,
	[
		{ when: (ship) => ship.turbolasers > 50, then: () => 'capital ship' },
		{ when: (ship) => ship.crew === 0, then: () => 'derelict' },
	],
	() => 'fighter',
);
```

Branches are tested in order, the first match wins, and the rest are never
evaluated — neither their conditions nor their bodies.

`otherwise` is optional, and leaving it out shows up in the type instead of
being hidden:

```ts
const unclassified = switchFor(contact, threats); // R | undefined
const classified = switchFor(contact, threats, () => 'unknown contact'); // R
```

Without a fallback, an unmatched value evaluates to `undefined` and the compiler
makes you account for it. With one, the `undefined` is gone, because nothing can
produce it any more.

This form **cannot** be exhaustive. A condition is an arbitrary function, and
the compiler cannot reason about which values it accepts — which is why it takes
a fallback and the exhaustive form does not. It also decides a branch without
narrowing the value inside `then`.

The Home One's sensors at Endor, classifying what comes out of hyperspace:

```ts
import { type SwitchCase, switchFor } from '@fulcro/functions';

interface Contact {
	name: string;
	turbolasers: number;
	crew: number;
}

let conditionsTested = 0;

const threats: SwitchCase<Contact, string>[] = [
	{
		when: (ship) => {
			conditionsTested++;
			return ship.turbolasers > 50;
		},
		then: () => 'capital ship',
	},
	{
		when: (ship) => {
			conditionsTested++;
			return ship.crew === 0;
		},
		then: () => 'derelict',
	},
];

const executor: Contact = { name: 'Executor', turbolasers: 5_000, crew: 279_144 };
const tieFighter: Contact = { name: 'TIE/ln', turbolasers: 0, crew: 1 };

console.log(switchFor(executor, threats)); // 'capital ship'
console.log(conditionsTested); // 1 — the second condition never ran

const unclassified: string | undefined = switchFor(tieFighter, threats);
const classified: string = switchFor(tieFighter, threats, () => 'fighter');

console.log(unclassified, classified); // undefined fighter
```

## `Result`

The outcome of an operation, as a value: a success carrying `value`, or a
failure carrying `error`. Build one with `success(value)` or `failure(error)`,
or let `tryCatch` build it for you.

```ts
const report = jump.handle({
	success: (parsecs) => `made it in ${String(parsecs)} parsecs`,
	failure: (error) => `jump failed: ${String(error)}`,
});
```

**`handle` is exhaustive.** Both branches are required, and leaving one out does
not compile. Only the branch for the variant at hand runs.

**Or narrow first**, with `isSuccess()` or `isFailure()`:

```ts
if (jump.isSuccess()) {
	jump.value; // T, not T | null
}
```

`error === null` narrows the same way, and survives a copy — through
`structuredClone`, a worker or JSON — that keeps the data of a result but not
its methods. **Never discriminate on `value`:** `0`, `''` and `null` are
perfectly good values, and `if (result.value)` reports every one of them as a
failure.

A failure's error is never `null` or `undefined`; `failure(null)` does not
compile, since the failure would then read as a success.

Two attempts at the Kessel Run, one with the hyperdrive working, and a copy of
the second carried across `structuredClone`:

```ts
import { failure, type Result, success } from '@fulcro/functions';

const kesselRun = (hyperdriveOnline: boolean): Result<number, string> => {
	return hyperdriveOnline ? success(12) : failure("it's not my fault");
};

const describe = (jump: Result<number, string>): string => {
	return jump.handle({
		success: (parsecs) => `made it in ${String(parsecs)} parsecs`,
		failure: (error) => `jump failed: ${error}`,
	});
};

const firstAttempt = kesselRun(true);
const secondAttempt = kesselRun(false);

console.log(describe(firstAttempt)); // 'made it in 12 parsecs'
console.log(describe(secondAttempt)); // "jump failed: it's not my fault"

if (firstAttempt.isSuccess()) {
	console.log(firstAttempt.value + 0); // 12 — a number here, not number | null
}

const copied = structuredClone(secondAttempt);

console.log(copied.error === null); // false — still a failure, without its methods
```

## `tryCatch`

Runs an operation and returns its outcome as a `Result`, instead of throwing.

```ts
const transmission = await tryCatch(() => fetch(holonetRelay));

if (transmission.isFailure()) return lastKnownPosition;

plotCourse(transmission.value);
```

**Prefer the callback form.** Passing a promise that already exists cannot catch
anything the expression throws on its way to producing it — in
`tryCatch(risky())`, `risky` runs first, and a synchronous throw inside it
escapes before `tryCatch` is ever called. The callback form moves that call
inside the `try`, which is the only way to cover both the synchronous and the
asynchronous failure of one operation. The promise form is still accepted, and
reads better when the promise is already in hand.

**`E` defaults to `unknown`, not to `Error`.** JavaScript lets any value be
thrown, so typing the error as an `Error` would be a claim this function cannot
keep — `result.error.message` would read `undefined` whenever something threw a
string. Narrow it at the use site, or pass the type explicitly when you own
every throw site:

```ts
const pilot = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load(callSign));
```

A thrown `null` or `undefined` — legal, however pathological — is wrapped in an
`Error` carrying the original value as its `cause`, because storing it as it
came would make the failure indistinguishable from a success.

`tryCatch` always returns a promise, including for a fully synchronous
operation.

The Rebel archive on Yavin 4, asked for a pilot it has, one it does not, and one
lookup that throws something that is not an `Error` at all:

```ts
import { tryCatch } from '@fulcro/functions';

interface Pilot {
	callSign: string;
	name: string;
}

class ArchiveError extends Error {
	constructor(readonly callSign: string) {
		super(`No record of ${callSign}`);
	}
}

const records = new Map<string, Pilot>([
	['Red Five', { callSign: 'Red Five', name: 'Luke Skywalker' }],
]);

const rebelArchive = {
	load: async (callSign: string): Promise<Pilot> => {
		const pilot = records.get(callSign);

		if (pilot === undefined) throw new ArchiveError(callSign);

		return Promise.resolve(pilot);
	},
};

const found = await tryCatch(() => rebelArchive.load('Red Five'));

if (found.isSuccess()) {
	console.log(found.value.name); // 'Luke Skywalker'
}

const missing = await tryCatch<Pilot, ArchiveError>(() => rebelArchive.load('Red Six'));

if (missing.isFailure()) {
	console.log(missing.error.callSign); // 'Red Six' — typed, because every throw site is ours
}

const sabotaged = await tryCatch(() => {
	throw 'the Bothans were wrong';
});

if (sabotaged.isFailure()) {
	console.log(typeof sabotaged.error); // 'string' — `E` is `unknown` for exactly this
}
```

## `Option`

A value that may be absent, as a value of its own rather than as `null`.

```ts
const docked: Option<Starship> = optionOf(landingPads.get(pad));

const greeting = docked.handle({
	some: (ship) => `Welcome to Cloud City, Captain ${ship.captain}`,
	none: () => `${pad} is empty`,
});
```

`optionOf` reads `null` and `undefined` as absent, and everything else — `0`,
`''` and `false` included — as present. `some(value)` keeps whatever it is
given, and `none()` is always the same frozen object. Narrow with `isSome()` or
`isNone()`: `some(null)` and `none()` hold the same data, and only the variant
tells them apart.

Lando's landing pads at Cloud City, greeting whoever is on them:

```ts
import { none, type Option, optionOf, some } from '@fulcro/functions';

interface Starship {
	name: string;
	captain: string;
	passengers: number;
}

const landingPads = new Map<string, Starship>([
	['Pad 9', { name: 'Slave I', captain: 'Boba Fett', passengers: 0 }],
	['Pad 327', { name: 'Millennium Falcon', captain: 'Han Solo', passengers: 3 }],
]);

const greet = (pad: string): string => {
	const docked: Option<Starship> = optionOf(landingPads.get(pad));

	return docked.handle({
		some: (ship) => `Welcome to Cloud City, Captain ${ship.captain}`,
		none: () => `${pad} is empty`,
	});
};

console.log(greet('Pad 327')); // 'Welcome to Cloud City, Captain Han Solo'
console.log(greet('Pad 1')); // 'Pad 1 is empty'

const bountyHunterPassengers = optionOf(landingPads.get('Pad 9')?.passengers);

console.log(bountyHunterPassengers.isSome()); // true — 0 is an answer, not an absence
console.log(some(null).isSome(), none().isNone()); // true true
```

## `equals`

Tells whether two values hold the same thing, where `===` only tells whether
they are the same object.

```ts
equals(
	{ callSign: 'Red Five', victories: ['Death Star'] },
	{ callSign: 'Red Five', victories: ['Death Star'] },
); // true
equals(some(null), none()); // false: same data, different variants
```

Plain objects, arrays, `Result` and `Option`, dates, maps, sets and buffers are
compared by what they hold; an instance of a class equals only itself, since it
may keep its state where nothing can read it. `createEquals` makes a variant
that compares some kinds of value by rules of your own — and the descriptor of
every type of `@fulcro/types` already is one:

```ts
const byCallSign: EqualityRule<Pilot> = {
	is: (value): value is Pilot => value instanceof Pilot,
	equals: (left, right) => left.callSign === right.callSign,
};

const sameRoster = createEquals([byCallSign]);
const sameFighters = createEquals([Starfighter]); // a struct, compared field by field
```

Red Squadron's roster before and after Hoth, where a promotion changes a rank
but not a pilot, and two X-wings read off the same sensor sweep:

```ts
import { createEquals, type EqualityRule, equals, none, some } from '@fulcro/functions';
import { SinglePrecisionFloat, struct } from '@fulcro/types';

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
console.log(sameRoster(beforeHoth, afterHoth)); // true — the same pilots, by call sign

const debrief = { callSign: 'Red Five', victories: ['Death Star'] };

console.log(equals(debrief, { callSign: 'Red Five', victories: ['Death Star'] })); // true
console.log(equals(some(null), none())); // false

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});

const sameFighters = createEquals([Starfighter]);

const redFive = Starfighter.from({ shields: 100, hull: 80, speed: 1050 });
const redTwo = Starfighter.from({ shields: 100, hull: 80, speed: 1050 });

console.log(redFive === redTwo, sameFighters(redFive, redTwo)); // false true
```

---

**Full guide:** [docs/functions.md](../../docs/functions.md) — scenarios, worked
examples and the failure modes worth knowing before you meet them.
🇧🇷 [Leia em português](../../docs/pt-BR/functions.md).
