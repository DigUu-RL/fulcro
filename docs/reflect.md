# Reflection

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/reflect.md)

Thirteen utilities that answer questions TypeScript erases on its way to
JavaScript: what a name was, what a type says, what is a valid empty value, how
much memory a type declares and where its fields sit, and whether the thing in
front of you really is what it claims — and one that answers a question while
the program compiles, so it costs nothing when it runs.

```sh
npm install @fulcro/reflect
```

```ts
import {
	alignOf,
	as,
	constantOf,
	defaultOf,
	is,
	keysOf,
	layoutOf,
	nameOf,
	offsetOf,
	pathOf,
	pathsOf,
	sizeOf,
	typeOf,
} from '@fulcro/reflect';
```

One package: the compile time transformer ships inside it, as
`@fulcro/reflect/transformer`. It is not optional —
[see below](#the-transformer-is-not-optional) — but there is nothing else to
install, and no way to end up with half of it.

## The problem

TypeScript's types do not exist at runtime. Interfaces, type aliases, generic
arguments and the file a type was declared in all vanish when the compiler emits
JavaScript:

```ts
interface RebelPilot {
	callSign: string;
}

// At runtime there is no `RebelPilot`. There is nothing to ask.
```

So a plain function can only ever report what it can see in the _value_ in front
of it. These three go further, by doing their work **while the compiler is still
running**.

A pilot record arriving from the Alliance archives: the value knows its fields,
and nothing at runtime remembers the type — except what the transformer wrote
down while it still could:

```ts
import { nameOf } from '@fulcro/reflect';

interface RebelPilot {
	callSign: string;
	homeworld: string;
}

const pilot: RebelPilot = JSON.parse('{ "callSign": "Red Five", "homeworld": "Tatooine" }');

console.log(typeof pilot); // 'object' — all the language can say
console.log(nameOf<RebelPilot>()); // 'RebelPilot' — read while compiling, emitted as a literal
```

## `nameOf` — the name as written

```ts
const callSign = 'Red Five';

nameOf(() => callSign); // 'callSign'
nameOf(() => pilot.starfighter.astromech); // 'astromech'    (last segment)
nameOf(() => pilot['callSign']); // 'callSign'
nameOf(() => pilot.eject); // 'eject'     (never calls it)
nameOf<PilotRecord>(); // 'PilotRecord'
nameOf(Starfighter); // 'Starfighter'
```

The accessor is **never invoked**, so it is safe on a getter with side effects
and costs nothing to evaluate.

### Where you actually use `nameOf`

Anywhere a string has to match a property name, and a typo would be silent:

```ts
// Sorting by a column name that a rename would break loudly.
const column = nameOf(() => pilot.confirmedKills);

// A form field bound to a model property.
register(nameOf(() => application.homeworld));

// A validation message that follows a rename.
throw new Error(`${nameOf(() => manifest.cargoWeight)} is required`);
```

Rename `confirmedKills` in your editor and the string follows. Write
`'confirmedKills'` by hand and it does not.

The Alliance's pilot registry — a sort column, a form field and a validation
message, every one of them a name the compiler checked:

```ts
import { nameOf } from '@fulcro/reflect';

interface PilotApplication {
	callSign: string;
	homeworld: string;
	confirmedKills: number;
}

class Starfighter {
	constructor(readonly model: string) {}
}

const application: PilotApplication = { callSign: 'Rogue Four', homeworld: '', confirmedKills: 2 };
const formFields: string[] = [];

const register = (field: string): void => {
	formFields.push(field);
};

const validate = (candidate: PilotApplication): string[] => {
	return candidate.homeworld === '' ? [`${nameOf(() => candidate.homeworld)} is required`] : [];
};

register(nameOf(() => application.callSign));
register(nameOf(() => application.homeworld));

console.log(formFields); // ['callSign', 'homeworld']
console.log(validate(application)); // ['homeworld is required']
console.log(nameOf(() => application.confirmedKills)); // 'confirmedKills' — the sort column
console.log(nameOf(Starfighter)); // 'Starfighter'
console.log(nameOf<PilotApplication>()); // 'PilotApplication'
```

## `typeOf` — a `typeof` that answers properly

The native `typeof` has eight answers and collapses most of what a program needs
to tell apart:

```ts
typeof null; // 'object'      ← unhelpful
typeof ['Hoth', 'Endor']; // 'object'      ← unhelpful
typeof NaN; // 'number'      ← unhelpful
typeof new Date(); // 'object'      ← unhelpful
```

```ts
typeOf(null).typeId; // 'null'
typeOf(['Hoth', 'Endor']).typeId; // 'array'
typeOf(NaN).typeId; // 'nan'
typeOf(new Date()).typeId; // 'date'
typeOf(new Stormtrooper()); // { typeId: 'instance', name: 'Stormtrooper', … }
```

The result carries:

| Field                            | What it says                                                 |
| -------------------------------- | ------------------------------------------------------------ |
| `typeId`                         | The runtime shape, usable as a `switch` discriminant         |
| `name`                           | `'Stormtrooper'`, `'Date'`, `'(anonymous)'`                  |
| `lineage`                        | The prototype chain: `['Stormtrooper', 'Trooper', 'Object']` |
| `primitive` `nullish` `iterable` | Flags worth having without another check                     |
| `declared`                       | The **written** type — only with the transformer             |

`declared` is the one nothing else can give you:

```ts
typeOf(pilot).declared;
// { text: 'PilotRecord', name: 'PilotRecord', kind: 'interface',
//   site: { path: 'src/models/pilot.ts', line: 12, column: 18 } }
```

The type's name, how it was declared, and the file and line it came from.

### Where you actually use `typeOf`

```ts
// A logger that says what it got, not 'object'.
log(`expected a Date, got ${typeOf(value).name}`);

// Dispatch on shape without a chain of instanceof.
switch (typeOf(cargo).typeId) {
	case 'array':
		return cargo.length;
	case 'map':
	case 'set':
		return cargo.size;
	case 'string':
		return cargo.length;
}
```

`typeOf` never reads the contents of what it inspects and never evaluates an
accessor, so describing a million-element array costs the same as describing a
one-element one, and an expensive getter is not triggered by looking at the
object that carries it.

A customs officer at Mos Eisley logging whatever arrives in a cargo hold, by
what it really is:

```ts
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

console.log(typeOf(manifest).declared?.name); // 'Manifest' — the type as written, from the transformer
```

## `defaultOf` — the emptiest valid value of a type

```ts
interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	torpedoes: number;
	astromechs: string[];
	note?: string;
}

defaultOf<PreflightChecklist>();
// { ship: '', pilot: { callSign: '', cleared: false }, torpedoes: 0, astromechs: [] }

defaultOf<string>(); // ''
defaultOf<'light' | 'dark'>(); // 'light'
```

**One rule covers every case: the result is always a valid `T`.** Required
properties are filled, optional ones are left out — absence already satisfies
them — a literal type yields its only inhabitant, and a union yields `null` or
`undefined` where it admits one.

Tuples are filled position by position, arrays come back empty, `Set` and `Date`
are instantiated rather than described, and a circular type is closed off instead
of nesting forever.

### Where you actually use `defaultOf`

```ts
// An empty form state that follows the model.
const [draft, setDraft] = useState(defaultOf<PreflightChecklist>());

// A test fixture with only the field under test written out.
const checklist = { ...defaultOf<PreflightChecklist>(), torpedoes: 2 };

// Resetting to empty without a hand-maintained constant.
setFilters(defaultOf<HangarFilters>());
```

Add a required field to `PreflightChecklist` and every one of those follows. A
hand-written `{ ship: '', torpedoes: 0 }` does not, and the compiler will not tell
you.

The hangar deck's checklist terminal, starting each fighter from a blank form
that always matches the model:

```ts
import { defaultOf } from '@fulcro/reflect';

interface PreflightChecklist {
	ship: string;
	pilot: { callSign: string; cleared: boolean };
	torpedoes: number;
	astromechs: string[];
	note?: string;
}

const blank = defaultOf<PreflightChecklist>();

console.log(blank);
// { ship: '', pilot: { callSign: '', cleared: false }, torpedoes: 0, astromechs: [] }

const redFive: PreflightChecklist = {
	...blank,
	ship: 'T-65B X-wing',
	pilot: { callSign: 'Red Five', cleared: true },
	torpedoes: 2,
	astromechs: ['R2-D2'],
};

console.log(redFive.pilot.cleared, blank.pilot.cleared); // true false — the blank was not touched
console.log(defaultOf<'light' | 'dark'>()); // 'light'
```

## `pathOf` — the whole path, not the last name

`nameOf` answers with the last segment. `pathOf` answers with all of them:

```ts
nameOf(() => pilot.starfighter.astromech); // 'astromech'
pathOf(() => pilot.starfighter.astromech); // 'starfighter.astromech'

pathOf(() => squadron.pilots[0].callSign); // 'pilots[0].callSign'
pathOf(() => squadron['leader'].callSign); // 'leader.callSign'
```

Which is what a form field name, a database column, a sort key or a translation
key actually needs — the name alone loses where the value lives.

**The root is dropped**, because the path is relative to it. The object being
described is the form, the row, the document, and repeating whatever the local
variable happened to be called would make the answer depend on that.

The accessor is never invoked, so this is safe on a getter with side effects.
With the transformer it becomes a literal before a minifier can rename
anything; without it the source of the closure is parsed at runtime, which
works and carries the same caveat `nameOf` does.

A squadron roster form, whose field names are the paths into the record it
edits:

```ts
import { pathOf } from '@fulcro/reflect';

interface SquadronRecord {
	name: string;
	leader: { callSign: string; homeworld: string };
	pilots: { callSign: string; starfighter: { astromech: string } }[];
}

const squadron: SquadronRecord = {
	name: 'Rogue Squadron',
	leader: { callSign: 'Rogue Leader', homeworld: 'Tatooine' },
	pilots: [{ callSign: 'Rogue Two', starfighter: { astromech: 'R5-D4' } }],
};

const fields = [
	pathOf(() => squadron.name),
	pathOf(() => squadron['leader'].callSign),
	pathOf(() => squadron.pilots[0].starfighter.astromech),
];

console.log(fields); // ['name', 'leader.callSign', 'pilots[0].starfighter.astromech']
```

## Describing a type without a value

Five utilities answer questions about a **type**, with no value to inspect.
All five need the transformer, and refuse without it.

### `keysOf<T>()`

```ts
keysOf<HangarManifest>(); // ['bay', 'ship', 'captain', 'cleared']
```

For the lists a program keeps writing out by hand and forgetting to update: the
columns of a table, the fields of a form, the properties to copy.

**This is deliberately not `Object.keys`.** The keys of a value and the keys of
a type are different questions: structural typing lets an object carry more than
its type declares, which is exactly why `Object.keys` returns `string[]` rather
than `(keyof T)[]`. Typing that cast as the narrower thing would be a lie of the
same family as the language's own `as`. This one never looks at a value.

The hangar control screen, whose table columns come from the type — and stay
the type's when a record carries more:

```ts
import { keysOf } from '@fulcro/reflect';

interface HangarManifest {
	bay: number;
	ship: string;
	captain: string;
	cleared: boolean;
}

const columns = keysOf<HangarManifest>();

const arrivals = [
	{ bay: 94, ship: 'Millennium Falcon', captain: 'Han Solo', cleared: false, smuggling: true },
];

const rows = arrivals.map((arrival) =>
	columns.map((column) => String(arrival[column])).join(' | '),
);

console.log(columns); // ['bay', 'ship', 'captain', 'cleared']
console.log(rows); // ['94 | Millennium Falcon | Han Solo | false'] — the extra field is not a column
console.log(Object.keys(arrivals[0]).length); // 5 — what the value has, not what the type declares
```

### `typeOf<T>()`

The counterpart of `typeOf(value)`. That one describes what a value **is**; this
describes what a type **says**:

```ts
typeOf<HangarManifest>();
// {
//   text: 'HangarManifest', name: 'HangarManifest', kind: 'interface',
//   site: { path: 'src/hangar/manifest.ts', line: 4, column: 1 },
//   members: [
//     { name: 'bay',  type: 'number', optional: false, readonly: true },
//     { name: 'note', type: 'string | undefined', optional: true, readonly: false },
//   ],
//   union: null,
//   element: null,
// }
```

`members` is what a separate `membersOf<T>()` would have returned — one
question, one place. `union` carries the branches when the type is one, and
`element` the element type when it is an array; both are `null` otherwise,
because an empty list would read as a shape with nothing in it.

The two forms are told apart by having an argument or not, so `typeOf(undefined)`
keeps describing the undefined value.

The deck officer's documentation panel, written from the type itself:

```ts
import { typeOf } from '@fulcro/reflect';

interface HangarManifest {
	readonly bay: number;
	ship: string;
	note?: string;
}

const manifestType = typeOf<HangarManifest>();

console.log(manifestType.name, manifestType.kind); // 'HangarManifest' 'interface'

for (const member of manifestType.members) {
	console.log(
		`${member.name}: ${member.type}${member.optional ? ' (optional)' : ''}${member.readonly ? ' (readonly)' : ''}`,
	);
}
// 'bay: number (readonly)'
// 'ship: string'
// 'note: string | undefined (optional)'

console.log(typeOf<string[]>().element); // 'string'
```

### `pathsOf<T>()`

Every leaf the type can be walked to:

```ts
pathsOf<BountyContract>();
// [
//   { path: 'target',                type: 'string',  optional: false },
//   { path: 'client.name',           type: 'string',  optional: false },
//   { path: 'hunters[].name',        type: 'string',  optional: false },
//   { path: 'status', type: '"open" | "claimed"',    optional: false },
//   { path: 'postedAt',              type: 'Date',    optional: false },
// ]
```

For anything that enumerates a shape rather than reads one value: the columns a
report can sort by, the fields a form renders, the keys a translation file
needs.

**Three rules keep the answer useful**, and each exists because the version
without it produces nonsense.

A **primitive is a leaf.** Descending into one yields the whole of
`String.prototype` — `client.name.trimLeft` is a real property path and useless
as a data path.

A **known class is a leaf.** `postedAt` reports `Date`, not the fifty methods a
date carries.

**Recursion stops** at the repeat, naming the type at the end of the path. A
type containing itself has infinitely many paths, and where the repeat begins is
more honest than an arbitrary depth of it.

A union of primitives is a leaf and reports the union. A union with an object in
it is reported without being descended: there is no single path to promise when
the shape depends on which branch a value took.

The Guild's report builder, offering every column a bounty contract can be
sorted by:

```ts
import { pathsOf } from '@fulcro/reflect';

interface BountyContract {
	target: string;
	client: { name: string };
	hunters: { name: string }[];
	status: 'open' | 'claimed';
	postedAt: Date;
}

const sortable = pathsOf<BountyContract>().map((leaf) => `${leaf.path} (${leaf.type})`);

console.log(sortable);
// [
//   'target (string)',
//   'client.name (string)',
//   'hunters[].name (string)',
//   'status ("open" | "claimed")',
//   'postedAt (Date)',
// ]
```

### `sizeOf<T>()` and `alignOf<T>()`

The size and the alignment a type declares, in bytes:

```ts
import type { Decimal, SignedInteger } from '@fulcro/types';

sizeOf<SignedInteger<32>>(); // 4
alignOf<SignedInteger<32>>(); // 4
sizeOf<Decimal>(); // 16
```

The answer is typed as the literal the layout declares, the same one
`layoutOf<T>()` reports: `sizeOf<SignedInteger<32>>()` has the type `4`, not
`number`. A variable that accumulates sizes says so:

```ts
let total: number = sizeOf<SignedInteger<32>>();

total += sizeOf<Decimal>();
```

With the transformer, each call is replaced by the number, so it costs what a
literal costs. The numbers describe the binary format of the type — the two
bytes of a half precision float, the sixteen of a decimal128 — not what a
JavaScript engine spends on a value in its own heap.

**A type answers only if it declares a layout.** The numeric types of
[`@fulcro/types`](./types.md) do; `string`, `bigint`, an object and
`BigInteger` do not, and for those the call is a **type error**, not a number
somebody guessed:

```ts
sizeOf<string>(); // error: Type 'string' does not satisfy the constraint
```

What counts as declaring a layout is a shape, not an import: a type carrying a
`'~layout'` property whose `size` and `alignment` are number literals.
`@fulcro/types` declares it that way, and neither package imports the other.

Two calls compile and then throw at runtime, because there is no single number
to emit: a **generic parameter** that has not been substituted yet —
`sizeOf<T>()` inside a generic function — and a **union of different layouts**,
such as `sizeOf<SignedInteger<8> | SignedInteger<16>>()`.

The bytes a bounty record takes in the Guild's binary ledger, summed from what
each field's type declares:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import type { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

// Hunter licence number, the bounty in credits, and the number of attempts.
let recordBytes: number = sizeOf<SignedInteger<32>>();

recordBytes += sizeOf<Decimal>();
recordBytes += sizeOf<UnsignedInteger<8>>();

console.log(recordBytes); // 21
console.log(alignOf<Decimal>()); // 16
console.log(sizeOf<SignedInteger<32>>() * 1_000); // 4000 — a thousand licence numbers
```

### `offsetOf<T>(field)` and `layoutOf<T>()`

Where a field of a struct sits, and the whole layout at once:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

offsetOf<Starfighter>('hull'); // 4
offsetOf<Starfighter>('hyperdrive'); // error: not a field of Starfighter

layoutOf<Starfighter>();
// {
//   size: 12,
//   alignment: 4,
//   fields: {
//     shields: { offset: 0, size: 4, alignment: 4 },
//     hull: { offset: 4, size: 4, alignment: 4 },
//     speed: { offset: 8, size: 4, alignment: 4 },
//   },
// }
```

With the transformer, `offsetOf` is replaced by the number and `layoutOf` by a
frozen object literal, equal to the struct descriptor's own `Starfighter.layout`,
with the fields in the order they were declared. A method, `'~layout'` or any
other name that is not a field is a **type error**, and so is `offsetOf` on a
type without fields. `layoutOf` on a numeric type gives its size and alignment
and `fields: {}`.

The offsets are not written in the type; only each field's size and alignment
are. The transformer places the fields itself, by the rule
[`struct`](./types.md#where-the-fields-go) places them by at runtime —
largest alignment first, declaration order among equals — reading the order
from the type, where the compiler keeps it. That holds for a struct imported
from a built package as well: its declaration file still lists the fields in
the order they were written.

`offsetOf` needs the field as a **string literal**: a name held in a variable
is not known until the code runs, so the call is left to throw, as it is for a
generic parameter. A union of structs whose fields are placed differently has
no single answer either, and throws.

A starfighter telemetry buffer read field by field, at the offsets the type
declares — and a struct whose wide field is placed first:

```ts
import { layoutOf, offsetOf } from '@fulcro/reflect';
import {
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const telemetry = new DataView(new ArrayBuffer(layoutOf<Starfighter>().size));

telemetry.setFloat32(offsetOf<Starfighter>('hull'), 0.25, true);

console.log(telemetry.getFloat32(offsetOf<Starfighter>('hull'), true)); // 0.25 — a quarter of the hull left
console.log(layoutOf<Starfighter>().size); // 12

const NavigationBeacon = struct('NavigationBeacon', {
	channel: UnsignedInteger(8),
	parsecsFromCoruscant: DoublePrecisionFloat,
});
type NavigationBeacon = Struct<typeof NavigationBeacon>;

console.log(offsetOf<NavigationBeacon>('parsecsFromCoruscant')); // 0 — the largest alignment goes first
console.log(offsetOf<NavigationBeacon>('channel')); // 8
console.log(layoutOf<NavigationBeacon>().size); // 16
```

## `constantOf` — computed once, while the program compiles

A lookup table, a precomputed series, a set of coefficients: values that are
the same on every run, computed on every run anyway.

```ts
import { constantOf } from '@fulcro/reflect';

export const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);
// emitted: export const ASTROMECH_CHECKSUM_TABLE = Object.freeze([0, 1996959894, 3993919788, …]);
```

The call is plain TypeScript: `tsc`, an editor and a linter read it as a call,
and nothing in the file needs a plugin to be understood. With the transformer,
the function runs **while the program compiles**, and the call is replaced by
what it returned, frozen at every level. Without it, the call runs the function
at runtime and freezes the result the same way — the answer is the same, it is
only paid for later.

R2-D2's data port, checking the Death Star plans it received against the
checksum Princess Leia's ship sent with them — the table built once, at build
time:

```ts
import { constantOf } from '@fulcro/reflect';

const ASTROMECH_CHECKSUM_TABLE = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);

const checksum = (data: string): number => {
	let crc = 0xffffffff;

	for (const byte of new TextEncoder().encode(data)) {
		crc = (crc >>> 8) ^ (ASTROMECH_CHECKSUM_TABLE[(crc ^ byte) & 0xff] ?? 0);
	}

	return (crc ^ 0xffffffff) >>> 0;
};

const plans = 'Death Star technical readout: thermal exhaust port, two metres wide';

console.log(checksum(plans) === checksum(plans)); // true
console.log(ASTROMECH_CHECKSUM_TABLE[1]); // 1996959894
console.log(Object.isFrozen(ASTROMECH_CHECKSUM_TABLE)); // true — frozen at every level
```

### What it can prove

The transformer evaluates a call only when it can prove the function constant.
Every name the function reads from outside itself has to be:

- a **`const`** whose initializer is provable in turn — another `constantOf`
  included, which is then evaluated once and its value reused;
- a **function** declared in your source, whose body is provable in turn,
  recursion included;
- one of the **built-ins** whose answer depends only on their arguments —
  `Math`, `Number`, `String`, `Array`, `Object`, `JSON`, `BigInt`, `Map`, `Set`,
  the typed arrays and their like.

Names are followed across imports between your own files. Anything else is
refused, **at the call, as a compile error** naming the first name it could
not prove:

```text
FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'jumpsPlotted' is declared with let or var, so it can change. …
```

A `let`, a parameter of an enclosing function, a class, `Date`, `globalThis`,
and every value declared only in a `.d.ts` — which is everything imported from
another package, `@fulcro/types` included, since the compiler sees its types
and never its source. The function runs in a context of its own, with no
`Math.random` and a time limit of five seconds; a throw or a timeout is a
compile error too ([FULCRO4012](./errors/FULCRO4xxx.md#fulcro4012),
[FULCRO4013](./errors/FULCRO4xxx.md#fulcro4013)). None of these is ever left
quietly to the runtime: a build that asked for a value to be computed already
does not ship the computation instead.

### What it can return

What a literal can write: numbers — `NaN`, the infinities and `-0` included —
strings, booleans, bigints, `null`, `undefined`, and arrays and plain objects
of them. A function, a class instance, a `Map`, an array with holes, or an
object reached twice is refused with
[FULCRO4011](./errors/FULCRO4xxx.md#fulcro4011) — at compile time with the
transformer, and at runtime by the same rule without it, so the two can never
disagree.

## `is` and `as` — checking a value against a type

TypeScript's `as` is an **assertion, not a check**. `payload as DockingRecord`
compiles whatever `payload` turns out to be, and the mistake surfaces later,
somewhere else, as a property of `undefined`.

These two do the check the language cannot: the transformer reads the type while
the compiler still has it and writes the test out — every property, nested
objects, every element of an array.

```ts
if (is<DockingRecord>(payload)) {
	payload.bay; // narrowed, and actually verified
}

const record = as<DockingRecord>(JSON.parse(transmission));
```

`is` is a **type guard**, for when a failure should branch the program. `as`
returns the value — the same object, not a copy — and throws when it does not
match, for when a failure should stop it.

### The message names where it failed

```text
TypeError: FULCRO4007: as<DockingRecord>() refused a value: captain.name: expected string, got number
TypeError: FULCRO4007: as<DockingRecord>() refused a value: cargo[1]: expected string, got undefined
```

Told only _"not a DockingRecord"_ about a record with forty fields, you would be
no better off than before the check existed. So the transformer emits a second
walker beside the fast check, purely to answer **where**. It runs only once the
check has already refused, so a value that passes never pays for it — and only
`as` gets one, since a branch needs yes or no.

Where a type is more than the walker can describe precisely — an intersection, a
tuple, a union of object shapes — it names the type expected at that path rather
than guessing at a field. Vague beats wrong: a path is a promise about where the
problem is, and inventing one sends someone to the wrong field.

Docking control at Mos Eisley, branching on what passes and stopping on what
must not:

```ts
import { as, is } from '@fulcro/reflect';

interface DockingRecord {
	bay: number;
	ship: string;
	captain: { name: string };
	cargo: string[];
}

const arrivals: unknown[] = [
	{ bay: 94, ship: 'Millennium Falcon', captain: { name: 'Han Solo' }, cargo: ['passengers'] },
	{ bay: 86, ship: 'Slave I', captain: { name: 2187 }, cargo: ['carbonite'] },
];

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

console.log(record === arrivals[0]); // true — the same object, checked, not a copy
```

### What can be checked

The same set the sequences check, since it is the same generator: primitives,
literals, unions, intersections, objects and interfaces nested to any depth,
optional properties, arrays, fixed-length tuples, classes, the built-in classes
by `instanceof`, and types that contain themselves. Extra properties are
accepted, because structural typing accepts them.

Refused, and loudly: index signatures and unresolved generics. For those, write
the test and pass it in:

```ts
is<Holocron>(value, {
	name: 'Holocron',
	matches: (v) => looksLikeHolocron(v),
});
```

A test is typed by the type it vouches for: a `TypeTest<Starship>` is not
accepted where a `TypeTest<Holocron>` is asked for, so a test written for one
type cannot be handed to a check of another.

A holocron is an index signature — any era, any teaching — which the
transformer will not write out. The Archives' own test, passed in:

```ts
import { is } from '@fulcro/reflect';

interface Holocron {
	[era: string]: string;
}

const looksLikeHolocron = (value: unknown): boolean => {
	return (
		value !== null &&
		typeof value === 'object' &&
		Object.values(value).every((teaching) => typeof teaching === 'string')
	);
};

const recovered: unknown[] = [{ 'Old Republic': 'The Rule of Two' }, { 'Clone Wars': 66 }];

const readable = recovered.filter((value) => {
	return is<Holocron>(value, { name: 'Holocron', matches: looksLikeHolocron });
});

console.log(readable.length); // 1
```

### Both need the transformer

Without it the call refuses rather than guessing. A check that answers `true`
for the wrong thing is worse than no check at all — it is false confidence at
exactly the boundary where the data is least trustworthy.

## The transformer is not optional

These utilities are named for what they read, and what they read is the _type_ —
which exists only while the compiler runs. Without the transformer the package
still loads and still answers, but it answers from the value instead:

|                                | Without                                | With the transformer                      |
| ------------------------------ | -------------------------------------- | ----------------------------------------- |
| `nameOf(() => pilot.callSign)` | `'callSign'` — parsed from the closure | `'callSign'` — emitted as a literal       |
| `nameOf<PilotRecord>()`        | not available                          | `'PilotRecord'`                           |
| `typeOf(v).declared`           | `null`                                 | the declared type and its source location |
| `defaultOf<T>()`               | **throws**                             | the built value, emitted inline           |
| `constantOf(() => …)`          | the function runs, at runtime          | its result, computed while compiling      |

Two of those degrade **quietly**, which is worth knowing before you meet it: a
minifier renames local variables, so `nameOf(() => callSign)` can report a
mangled name in a bundled build, and `typeOf(…).declared` simply reads `null`.
Only `defaultOf` fails loudly — deliberately, because a default it cannot
compute would be a lie.

## Wiring the transformer in

Two paths, depending on how you build. Nothing extra to install either way — the
transformer came with the package.

### With `tsc`

`tsc` does not run third-party transformers on its own; `ts-patch` teaches it to.

```sh
npm install --save-dev ts-patch
```

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"plugins": [{ "transform": "@fulcro/reflect/transformer", "type": "program" }],
	},
}
```

```jsonc
// package.json — build with tspc rather than tsc
{ "scripts": { "build": "tspc -p tsconfig.json" } }
```

### With a bundler

```ts
// vite.config.ts
import { vite as fulcro } from '@fulcro/reflect/unplugin';

export default defineConfig({ plugins: [fulcro()] });
```

`rollup`, `webpack`, `rspack`, `esbuild` and `farm` are exported under their own
names and take the same options. The plugin declares `enforce: 'pre'`, which
matters — once esbuild or swc has erased the types, there is nothing left to
read.

The Vite configuration of the Alliance's fleet tracker, with the project root
named so the paths in `typeOf(…).declared` are relative to it:

```ts
// vite.config.ts of the Rebel fleet tracker
import { fileURLToPath } from 'node:url';

import { vite as fulcroReflect } from '@fulcro/reflect/unplugin';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [fulcroReflect({ projectRoot: fileURLToPath(new URL('.', import.meta.url)) })],
});
```

### TypeScript 5.9 or later, up to but not including 7

5.9 is where the compiler marks a type-only import the way the transformer reads
it. 7.x is the native port, and its package no longer exposes the compiler API this
is built on. The peer range says so rather than letting an install succeed into
a transformer that cannot start. `@fulcro/reflect` itself is unaffected and runs
anywhere, in its fallback behaviour.

## Troubleshooting

**`defaultOf` throws.** The transformer did not run over that file. Building with
`tsc` rather than `tspc`, or a bundler plugin registered after the TypeScript
step, are the two usual causes.

**`typeOf(…).declared` is `null`, or `nameOf` reports a mangled name.** Same
cause. These two degrade quietly, so check them whenever the build setup changes.

**The build fails with FULCRO4010 on a `constantOf`.** The function reads
something the transformer cannot prove constant, and the message names it.
Under a bundler the refusals of a file arrive together, as
[FULCRO5003](./errors/FULCRO5xxx.md#fulcro5003).

**The paths from `typeOf` look wrong.** Set `projectRoot` explicitly; they are
made relative to it, and the default is the compiler's working directory.
