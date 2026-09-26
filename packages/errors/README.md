# @fulcro/errors

Every error the `@fulcro` packages throw, each with a stable code. Installed for
you as a dependency of the other packages; you only need it directly to create
the same errors in code of your own.

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
try {
	Vector3.from(payload);
} catch (error) {
	if ((error as { code?: string }).code === 'FULCRO6021') {
		// a field is missing
	}
}
```

- The code starts the message and is on the error as `code`.
- The class is the built-in one it always was, so `instanceof RangeError` keeps
  working.
- A code keeps its meaning and is never reused; the wording after it may
  improve.

What every code means, and what to write instead:
[Error codes](https://github.com/DigUu-RL/fulcro/blob/main/docs/errors.md).

## API

```ts
import {
	type CodedError,
	createError,
	type ErrorCode,
	prefixError,
} from '@fulcro/errors';
```

| Export        | What it is                                                              |
| ------------- | ----------------------------------------------------------------------- |
| `createError` | Creates the error a registered code names, from its message's values    |
| `prefixError` | Places a coded error in a wider context, keeping its code and its class |
| `ErrorCode`   | The union of every registered code                                      |
| `CodedError`  | An `Error` carrying `code`                                              |
