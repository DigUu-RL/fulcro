# @fulcro/errors

Every error the `@fulcro` packages throw, each with a stable code and the
details it was made from. Installed for you as a dependency of the other
packages; import it to recognise those errors, or to create the same ones in
code of your own.

```text
TypeError: FULCRO6021: Starfighter.from: missing field 'speed'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	Starfighter.from(telemetry);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'speed' — the field that is missing
	}
}
```

The hangar on Yavin 4 reading the telemetry of an X-wing that came back from the
trench with its speed sensor shot away, and telling the crew which field to
check:

```ts
import { FulcroError, isFulcroError } from '@fulcro/errors';
import { SinglePrecisionFloat, struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});

const telemetry: unknown = JSON.parse('{ "shields": 0, "hull": 0.4 }');

try {
	Starfighter.from(telemetry as never);
} catch (error) {
	console.log((error as Error).message); // "FULCRO6021: Starfighter.from: missing field 'speed'."

	if (isFulcroError(error, 'FULCRO6021')) {
		console.log(error.code, error.details.field); // FULCRO6021 speed
		console.log(error instanceof TypeError, error instanceof FulcroError); // true true
		console.log(Object.isFrozen(error.details)); // true
	}
}
```

- The code starts the message and is on the error as `code`.
- The values the message was written from are on the error as `details`, by
  name, frozen — always with the `operation` that failed.
- The class is the built-in one it always was, so `instanceof RangeError` keeps
  working, and `instanceof FulcroError` holds as well.
- A code keeps its meaning and is never reused, and a field of its details
  keeps its name; the wording after the code may improve.

What every code means, the fields of its details, and what to write instead:
[Error codes](https://github.com/DigUu-RL/fulcro/blob/main/docs/errors.md).
🇧🇷 [Leia em português](../../docs/pt-BR/errors.md).

## API

```ts
import {
	createError,
	type DetailsOf,
	type ErrorCode,
	FulcroError,
	isFulcroError,
	prefixError,
} from '@fulcro/errors';
```

| Export          | What it is                                                                      |
| --------------- | ------------------------------------------------------------------------------- |
| `isFulcroError` | Tells whether a value is an error of these packages, of one code when given     |
| `FulcroError`   | The type of such an error, and the value `instanceof` recognises one with       |
| `DetailsOf`     | The type of one code's details                                                  |
| `createError`   | Creates the error a registered code names, from its details                     |
| `prefixError`   | Places an error in a wider context, keeping its code, its details and its class |
| `ErrorCode`     | The union of every registered code                                              |
