# Error codes

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/errors.md)

Every error a `@fulcro` package throws carries a code and its details. The code
is at the start of the message and on the error itself; the details are the
values the message was written from, by name:

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
import { isFulcroError } from '@fulcro/errors';

try {
	Vector3.from(payload);
} catch (error) {
	if (isFulcroError(error, 'FULCRO6021')) {
		error.details.field; // 'x' — ask for it again
	}
}
```

The code and the details are the parts to depend on. The wording after the code
may be improved in any release; the code keeps its meaning and is never reused
for anything else, even after the error it named is gone, and a field of its
details keeps its name.

The class does not change either. An error that was a `RangeError` before it
had a code is still a `RangeError`, so `instanceof` checks keep working.

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
RangeError: FULCRO6031: Particle.from: field 'charge': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

The original error, as the field raised it, is the `cause`. The details are the
field's, unchanged: the context is in the message only.

## Across a worker

An error thrown inside a worker of `@fulcro/parallel` cannot cross back as the
error object itself. One of the library's own errors crosses as its code and its
details, and the pool creates it again on your side — same code, same class,
same details. An error your task threw comes back as
[FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005) with your message kept word for
word.
