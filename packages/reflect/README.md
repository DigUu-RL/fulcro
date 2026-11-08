# @fulcro/reflect

`nameOf`, `typeOf`, `defaultOf`, `is`, `as`, `sizeOf` and the rest — utilities
that answer questions TypeScript erases on its way to JavaScript.

```sh
npm install @fulcro/reflect
```

One package. The compile time transformer ships **inside** it, as
`@fulcro/reflect/transformer`, so there is nothing else to install and no way to
end up with the utilities but not the thing that resolves them.

It used to be a second package, installed as a peer dependency, and that went
wrong in both of the ways it could. npm installs peers and Yarn does not, so a
project could get the utilities alone — quietly, because these degrade rather
than crash. And `@fulcro/reflect@0.3` with `@fulcro/transformer@0.2` was an
installable, broken combination. What a call means and what it compiles to are
now released together, because they are the same package.

**The transformer is not optional, and it is not a menu.** These
utilities are named for what they read, and what they read is the
type — which exists only while the compiler is running. Without the transformer
the package still loads and still answers, but it answers from the value in
front of it: `typeOf` reports a runtime shape with `declared` reading `null`,
`nameOf` falls back to parsing the closure and is at the mercy of a minifier,
and `defaultOf` throws, because a default it cannot compute would be a lie.

That is a fallback, not a mode to choose. The transformer is a **build time**
concern and lives behind its own entry point, so a bundle that only imports
these functions at runtime never pulls the compiler machinery in — but it is
always there to be wired up.

```ts
import { defaultOf, nameOf, typeOf } from '@fulcro/reflect';
```

What each utility gains from the transformer is spelled out below, and
summarised in a table at the end. Wiring it into a build takes one entry in a
tsconfig:

```json
{
	"plugins": [{ "transform": "@fulcro/reflect/transformer", "type": "program" }]
}
```

or one plugin in a bundler, from `@fulcro/reflect/unplugin`. See
[docs/reflect.md](../../docs/reflect.md) for the full setup.

Looking for `switchFor` or `tryCatch`? They moved to
[`@fulcro/functions`](../functions). Neither has anything to do with the
compiler, and keeping them here blurred what this package is for.

## `nameOf`

Reads a name as it was written in the source.

```ts
const callSign = 'Red Five';

nameOf(() => callSign); // 'callSign'
nameOf(() => pilot.starfighter.astromech); // 'astromech'  (last segment of a path)
nameOf(() => pilot['callSign']); // 'callSign'
nameOf(() => pilot.eject); // 'eject'      (never calls it)
nameOf(Starfighter); // 'Starfighter'
nameOf(1138); // 'Number'
```

The accessor is never invoked — the name is read out of the source of the
closure, so `nameOf(() => pilot.eject)` costs nothing and is safe on a getter
with side effects.

**Two limits, both from the language rather than this implementation:**

- Interfaces and type aliases have no runtime existence, so the runtime form
  cannot name them. With the transformer, `nameOf<PilotRecord>()` can.
- A minifier renames local variables, so `nameOf(() => callSign)` may report a
  mangled name in a bundled build. Property names, method names and the form
  taking a class normally survive. With the transformer the name is resolved
  before minification ever runs, so this stops being a concern.

The Alliance's recruitment terminal on Yavin 4, whose form fields and
validation messages follow the model's property names instead of repeating them
as strings:

```ts
// Needs the @fulcro/reflect transformer for `nameOf<PilotRecord>()`.
import { nameOf } from '@fulcro/reflect';

interface PilotRecord {
	callSign: string;
	homeworld: string;
	starfighter: { model: string; astromech: string };
}

class Starfighter {
	constructor(readonly model: string) {}
}

const recruit: PilotRecord = {
	callSign: 'Rogue Four',
	homeworld: '',
	starfighter: { model: 'T-47 airspeeder', astromech: 'none' },
};

let ejections = 0;

const pilot = {
	...recruit,
	get eject(): string {
		ejections++;
		return 'ejected';
	},
};

const validate = (candidate: PilotRecord): string[] => {
	return candidate.homeworld === '' ? [`${nameOf(() => candidate.homeworld)} is required`] : [];
};

console.log(validate(recruit)); // ['homeworld is required']
console.log(nameOf(() => pilot.starfighter.astromech)); // 'astromech'
console.log(
	nameOf(() => pilot.eject),
	ejections,
); // 'eject' 0 — the getter never ran
console.log(nameOf(Starfighter)); // 'Starfighter'
console.log(nameOf<PilotRecord>()); // 'PilotRecord'
```

## `typeOf`

A replacement for the native `typeof`, which answers with eight strings and
collapses most of what a program needs to tell apart.

```ts
typeof null; // 'object'
typeOf(null).typeId; // 'null'

typeof ['R2-D2', 'C-3PO']; // 'object'
typeOf(['R2-D2', 'C-3PO']).typeId; // 'array'

typeof NaN; // 'number'
typeOf(NaN).typeId; // 'nan'

typeOf(new Stormtrooper()); // { typeId: 'instance', name: 'Stormtrooper', … }
```

The result carries `typeId` (a discriminant usable in a `switch`), `name`,
`lineage` (the prototype chain, e.g. `['Stormtrooper', 'Trooper', 'Object']`),
and the flags `primitive`, `nullish` and `iterable`.

`lineage` is as close as runtime inspection gets to "where does this type come
from". It is a chain of constructors, never a module path — the compiler keeps
no record of where a class was declared.

**With the transformer**, a `declared` field is filled in with the _written_
type: its rendered text, its name, how it was declared (`interface`, `enum`,
`union`, …) and the file, line and column it came from. Without the transformer
`declared` reads `null` and everything else keeps working.

```ts
typeOf(pilot).declared;
// { text: 'PilotRecord', name: 'PilotRecord', kind: 'interface',
//   site: { path: 'src/models/pilot.ts', line: 12, column: 18 } }
```

A customs officer at Mos Eisley logging whatever arrives in a cargo hold, by
what it really is:

```ts
// Needs the @fulcro/reflect transformer for `declared`.
import { typeOf } from '@fulcro/reflect';

class Trooper {}
class Stormtrooper extends Trooper {}

interface Manifest {
	ship: string;
}

const describeCargo = (cargo: unknown): string => {
	const description = typeOf(cargo);

	switch (description.typeId) {
		case 'array':
			return `${String((cargo as unknown[]).length)} crates`;
		case 'map':
		case 'set':
			return `a sealed shipment of ${String((cargo as Set<unknown>).size)}`;
		case 'instance':
			return `a ${description.name}, lineage ${description.lineage.join(' → ')}`;
		default:
			return description.typeId;
	}
};

console.log(describeCargo(['spice', 'coaxium'])); // '2 crates'
console.log(describeCargo(new Set(['kyber']))); // 'a sealed shipment of 1'
console.log(describeCargo(new Stormtrooper())); // 'a Stormtrooper, lineage Stormtrooper → Trooper → Object'
console.log(describeCargo(Number.NaN)); // 'nan'
console.log(describeCargo(null)); // 'null'

const manifest: Manifest = { ship: 'Millennium Falcon' };

console.log(typeOf(manifest).declared?.kind); // 'interface' — the type as written, from the transformer
```

## `defaultOf`

Produces the emptiest value that still fully inhabits a type.

```ts
interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	astromechs: string[];
	note?: string;
}

defaultOf<PreflightChecklist>();
// { ship: '', pilot: { callSign: '', cleared: false }, astromechs: [] }

defaultOf<string>(); // ''
defaultOf<'light side' | 'dark side'>(); // 'light side'
```

One rule covers every case: **the result is always a valid `T`**. Required
properties are filled, optional ones are left out (absence already satisfies
them), a literal type yields its only inhabitant, and a union yields `null` or
`undefined` when it admits one, falling back to the default of its first member.
Tuples are filled position by position, arrays come back empty, `Set` and `Date`
are instantiated rather than described, and a circular type is closed off
instead of nesting forever.

**`defaultOf` requires the transformer.** A type has no runtime existence, so
there is genuinely nothing for a plain function to inspect. Without the
transformer the call throws, deliberately — a default it cannot compute would be
a lie, and failing loudly at the call site beats handing back a wrong value.

The hangar deck's checklist terminal, starting each fighter from a blank form
that always matches the model:

```ts
// Needs the @fulcro/reflect transformer.
import { defaultOf } from '@fulcro/reflect';

interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	astromechs: string[];
	note?: string;
}

const blank = defaultOf<PreflightChecklist>();

console.log(blank);
// { ship: '', pilot: { callSign: '', cleared: false }, astromechs: [] }

const redFive: PreflightChecklist = {
	...blank,
	ship: 'T-65B X-wing',
	pilot: { callSign: 'Red Five', cleared: true },
	astromechs: ['R2-D2'],
};

console.log(redFive.pilot.cleared, blank.pilot.cleared); // true false — the blank was not touched
console.log(defaultOf<'light side' | 'dark side'>()); // 'light side'
```

## `is` and `as`

The language's `as` asserts without checking — `payload as DockingRecord`
compiles whatever `payload` turns out to be, and the mistake surfaces later,
somewhere else, as a property of `undefined`. These two do the check it cannot.

```ts
if (is<DockingRecord>(payload)) {
	payload.captain.name; // narrowed, and actually verified
}

const record = as<DockingRecord>(await response.json());
```

`is` is a type guard, for branching. `as` returns the value unchanged — the same
object, not a copy — and throws when it does not match, for stopping.

The transformer writes the check out from the type: every property, nested
objects, every element of an array. A failing `as` names **where** it stopped
matching rather than only that it did:

```text
TypeError: FULCRO4007: as<DockingRecord>() refused a value: captain.name: expected string, got number
```

That message comes from a second walker emitted beside the check, which runs
only once the check has already refused — so a value that passes never pays for
it, and `is` does not carry one at all.

Index signatures and unresolved generics are refused, loudly. Write the test
yourself and pass it in as a second argument for those.

Mos Eisley's docking control, clearing the arrivals that match the record and
stopping at the one that does not:

```ts
// Needs the @fulcro/reflect transformer.
import { as, is } from '@fulcro/reflect';

interface DockingRecord {
	bay: number;
	ship: string;
	captain: { name: string };
	cargo: string[];
}

const arrivals: unknown[] = JSON.parse(`[
	{ "bay": 94, "ship": "Millennium Falcon", "captain": { "name": "Han Solo" }, "cargo": ["spice"] },
	{ "bay": 86, "ship": "Slave I", "captain": { "name": 1 }, "cargo": ["carbonite"] }
]`);

const cleared = arrivals
	.filter((arrival) => is<DockingRecord>(arrival))
	.map((record) => record.ship);

console.log(cleared); // ['Millennium Falcon']

try {
	as<DockingRecord>(arrivals[1]);
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO4007: as<DockingRecord>() refused a value: captain.name: expected string, got number'
}

const record = as<DockingRecord>(arrivals[0]);

console.log(record === arrivals[0]); // true — the same object, not a copy
```

## `constantOf`

A value computed once, while the program compiles, and written into the output
as a literal:

```ts
const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => checksumOf(byte)),
);
// emitted: const ASTROMECH_CHECKSUM_TABLE = Object.freeze([0, 1996959894, 3993919788, …]);
```

The transformer runs the function only when it can prove it constant — every
name it reads is a `const`, a function or a deterministic built-in in your own
source — and fails the build at the call otherwise, naming what it could not
prove. Without the transformer the function runs at runtime, with the same
result.

R2-D2's data port, checking the Death Star plans it received against the
checksum the Tantive IV sent with them — the table built once, at build time:

```ts
import { constantOf } from '@fulcro/reflect';

const checksumOf = (byte: number): number => {
	let crc = byte;

	for (let bit = 0; bit < 8; bit++) {
		crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}

	return crc >>> 0;
};

const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => checksumOf(byte)),
);

const checksum = (data: string): number => {
	let crc = 0xffffffff;

	for (const byte of new TextEncoder().encode(data)) {
		crc = (crc >>> 8) ^ (ASTROMECH_CHECKSUM_TABLE[(crc ^ byte) & 0xff] ?? 0);
	}

	return (crc ^ 0xffffffff) >>> 0;
};

const plans = 'Death Star technical readout: thermal exhaust port, two metres wide';

console.log(ASTROMECH_CHECKSUM_TABLE[1]); // 1996959894
console.log(Object.isFrozen(ASTROMECH_CHECKSUM_TABLE)); // true
console.log(checksum(plans) === checksum(plans)); // true
```

## With and without the transformer

|                                | Without                                | With the transformer                                          |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------- |
| `nameOf(() => pilot.callSign)` | `'callSign'` — parsed from the closure | `'callSign'` — emitted as a literal, minifier-proof           |
| `nameOf<PilotRecord>()`        | not available                          | `'PilotRecord'`                                               |
| `typeOf(value)`                | runtime shape; `declared` is `null`    | runtime shape **+** the declared type and its source location |
| `defaultOf<T>()`               | throws                                 | the built value, emitted inline                               |
| `sizeOf<T>()`, `alignOf<T>()`  | throws                                 | the number of bytes the type declares, emitted inline         |
| `offsetOf<T>('field')`         | throws                                 | where the struct's field sits, in bytes, emitted inline       |
| `layoutOf<T>()`                | throws                                 | the whole layout, fields placed, as a frozen literal          |
| `constantOf(() => …)`          | the function runs, at runtime          | its result, computed while compiling, as a frozen literal     |

Wiring the transformer is a build time concern only; this package stays a plain
runtime dependency either way, and nothing extra is installed to get it.

---

**Full guide:** [docs/reflect.md](../../docs/reflect.md) — scenarios, worked
examples and the failure modes worth knowing before you meet them.
🇧🇷 [Leia em português](../../docs/pt-BR/reflect.md).
