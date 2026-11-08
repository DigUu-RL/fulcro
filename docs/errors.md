# Error codes

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/errors.md)

Every error a `@fulcro` package throws carries a code and its details. The code
is at the start of the message and on the error itself; the details are the
values the message was written from, by name:

```text
TypeError: FULCRO6021: NavigationFix.from: missing field 'parsecsFromCoruscant'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	NavigationFix.from(transmission);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'parsecsFromCoruscant' — ask for it again
	}
}
```

The code and the details are the parts to depend on. The wording after the code
may be improved in any release; the code keeps its meaning and is never reused
for anything else, even after the error it named is gone, and a field of its
details keeps its name.

The class does not change either. An error that was a `RangeError` before it
had a code is still a `RangeError`, so `instanceof` checks keep working.

R2-D2 relaying a navigation fix whose transmission was cut short — the code
says what went wrong, and the details say which field to ask for again:

```ts
import { isFulcroError } from '@fulcro/errors';
import { SinglePrecisionFloat, struct, UnsignedInteger } from '@fulcro/types';

const NavigationFix = struct('NavigationFix', {
	parsecsFromCoruscant: SinglePrecisionFloat,
	hyperspaceLane: UnsignedInteger(8),
});

const receiveFix = (transmission: string, retransmit: (field: string) => void): void => {
	try {
		const fix = NavigationFix.from(JSON.parse(transmission));

		console.log(
			`Lane ${String(fix.hyperspaceLane)}, ${String(fix.parsecsFromCoruscant)} parsecs out`,
		);
	} catch (error) {
		if (isFulcroError(error, 'FULCRO6021')) {
			retransmit(error.details.field);

			return;
		}

		throw error;
	}
};

receiveFix('{ "hyperspaceLane": 3 }', (field) => {
	console.log(`R2-D2, transmit '${field}' again`); // "R2-D2, transmit 'parsecsFromCoruscant' again"
});

receiveFix('{ "hyperspaceLane": 3, "parsecsFromCoruscant": 12 }', () => {});
// 'Lane 3, 12 parsecs out'
```

## Reading what went wrong

`error.details` holds what the message says, as values rather than text, so
recovering from a failure never means taking a sentence apart:

```text
RangeError: FULCRO7002: ManagedStorage.get: index 12 is outside a storage of length 10.
```

```ts
error.details; // { operation: 'ManagedStorage.get', index: 12, length: 10 }
```

Every code's details have an `operation` — the function that failed, as you
called it. The other fields are the code's own, and each code's section lists
them. A number stays a number; a value of any other kind arrives described as
text, so an error never carries your objects with it into a log. The details
are frozen.

A Star Destroyer's hangar control, asked for a bay it does not have:

```ts
import { isFulcroError } from '@fulcro/errors';
import { createManagedStorage } from '@fulcro/memory';

const hangarBays = createManagedStorage<string | null>(10, null);

hangarBays.set(3, 'Lambda-class shuttle Tydirium');

try {
	hangarBays.get(12);
} catch (error) {
	if (isFulcroError(error, 'FULCRO7002')) {
		console.log(error.details); // { operation: 'ManagedStorage.get', index: 12, length: 10 }
		console.log(error instanceof RangeError); // true
	}
}
```

Three ways to recognise an error of this library, from `@fulcro/errors`:

| Write                                | Answers                     | `details` is known to be                                          |
| ------------------------------------ | --------------------------- | ----------------------------------------------------------------- |
| `isFulcroError(error, 'FULCRO7002')` | is it this code?            | that code's fields                                                |
| `isFulcroError(error)`               | is it any code of ours?     | `operation`, plus any code's fields once you compare `error.code` |
| `error instanceof FulcroError`       | the same, with `instanceof` | the same                                                          |

`FulcroError` works with `instanceof` without being a class the error extends:
the error is still a `RangeError` or a `TypeError`, and both checks hold at
once. The answer comes from the registered codes rather than from a prototype,
so it stays right even when two copies of `@fulcro/errors` end up installed side
by side.

To name one code's details in your own code — a handler, a mapper from errors
to responses — use `DetailsOf`:

```ts
import type { DetailsOf } from '@fulcro/errors';

const describe = (details: DetailsOf<'FULCRO7002'>): string =>
	`asked for ${details.index}, there were ${details.length}`;
```

The deck officer's console, turning any error of the library into a line for the
crew and keeping the bay number as a number:

```ts
import { FulcroError, isFulcroError } from '@fulcro/errors';
import type { DetailsOf } from '@fulcro/errors';
import { createManagedStorage } from '@fulcro/memory';

const describeBay = (details: DetailsOf<'FULCRO7002'>): string => {
	return `Bay ${String(details.index)} requested; this hangar has ${String(details.length)} bays`;
};

const forTheCrew = (error: unknown): string => {
	if (isFulcroError(error, 'FULCRO7002')) return describeBay(error.details);
	if (error instanceof FulcroError) return `${error.code} in ${error.details.operation}`;

	return 'Unknown malfunction — send for the Chief Engineer';
};

const hangarBays = createManagedStorage<string | null>(10, null);

try {
	hangarBays.get(12);
} catch (error) {
	console.log(forTheCrew(error)); // 'Bay 12 requested; this hangar has 10 bays'
}

console.log(forTheCrew(new Error('Rebel sabotage'))); // 'Unknown malfunction — send for the Chief Engineer'
```

## Where a code comes from

The first digit names the package that threw it:

| Range        | Package                  | Codes                                |
| ------------ | ------------------------ | ------------------------------------ |
| `FULCRO1xxx` | `@fulcro/collections`    | [FULCRO1xxx](./errors/FULCRO1xxx.md) |
| `FULCRO2xxx` | `@fulcro/functions`      | [FULCRO2xxx](./errors/FULCRO2xxx.md) |
| `FULCRO3xxx` | `@fulcro/parallel`       | [FULCRO3xxx](./errors/FULCRO3xxx.md) |
| `FULCRO4xxx` | `@fulcro/reflect`        | [FULCRO4xxx](./errors/FULCRO4xxx.md) |
| `FULCRO5xxx` | `@fulcro/transform-core` | [FULCRO5xxx](./errors/FULCRO5xxx.md) |
| `FULCRO6xxx` | `@fulcro/types`          | [FULCRO6xxx](./errors/FULCRO6xxx.md) |
| `FULCRO7xxx` | `@fulcro/memory`         | [FULCRO7xxx](./errors/FULCRO7xxx.md) |

Each page has one section per code, linkable as `FULCRO6xxx.md#fulcro6021`:
what it means, what usually causes it, the fields of its details, and what to
write instead.

## An error inside another one

Some errors are found one level inside what you called. Converting a struct
converts each of its fields, and a field that refuses its value refuses the
whole struct. The error keeps the field's code and its class, and gains the
place it was found:

```text
RangeError: FULCRO6031: Starfighter.from: field 'crew': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

The original error, as the field raised it, is the `cause`. The details are the
field's, unchanged: the context is in the message only.

A starfighter registered with a crew no cockpit could hold:

```ts
import { isFulcroError } from '@fulcro/errors';
import { SinglePrecisionFloat, struct, UnsignedInteger } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	crew: UnsignedInteger(8),
	shields: SinglePrecisionFloat,
});

try {
	Starfighter.from({ crew: 300, shields: 1 });
} catch (error) {
	if (isFulcroError(error, 'FULCRO6031')) {
		console.log(error.message);
		// "FULCRO6031: Starfighter.from: field 'crew': UnsignedInteger<8>.from: 300 is outside [0, 255]."

		console.log((error.cause as Error).message); // 'FULCRO6031: UnsignedInteger<8>.from: 300 is outside [0, 255].'
		console.log(error.details.operation); // 'UnsignedInteger<8>.from' — the field's details, unchanged
	}
}
```

## Across a worker

An error thrown inside a worker of `@fulcro/parallel` cannot cross back as the
error object itself. One of the library's own errors crosses as its code and its
details, and the pool creates it again on your side — same code, same class,
same details. An error your task threw comes back as
[FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005) with your message kept word for
word.
