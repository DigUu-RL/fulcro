# @fulcro/errors

Every error the `@fulcro` packages throw, each with a stable code and the
details it was made from. Installed for you as a dependency of the other
packages; import it to recognise those errors, or to create the same ones in
code of your own.

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	Vector3.from(payload);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'x' — the field that is missing
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

| Export          | What it is                                                                         |
| --------------- | ---------------------------------------------------------------------------------- |
| `isFulcroError` | Tells whether a value is an error of these packages, of one code when given        |
| `FulcroError`   | The type of such an error, and the value `instanceof` recognises one with          |
| `DetailsOf`     | The type of one code's details                                                     |
| `createError`   | Creates the error a registered code names, from its details                        |
| `prefixError`   | Places an error in a wider context, keeping its code, its details and its class    |
| `ErrorCode`     | The union of every registered code                                                 |
| `CodedError`    | Deprecated: `FulcroError` under its former name, removed in the next major version |
