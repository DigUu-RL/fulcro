# Error codes

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/errors.md)

Every error a `@fulcro` package throws carries a code. The code is at the start
of the message and on the error itself:

```text
TypeError: FULCRO6021: Vector3.from: missing field 'x'.
```

```ts
try {
	Vector3.from(payload);
} catch (error) {
	if ((error as { code?: string }).code === 'FULCRO6021') {
		// a field is missing — ask for it again
	}
}
```

The code is the part to depend on. The wording after it may be improved in any
release; the code keeps its meaning and is never reused for anything else, even
after the error it named is gone.

The class does not change either. An error that was a `RangeError` before it
had a code is still a `RangeError`, so `instanceof` checks keep working.

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

Each page has one section per code, linkable as `FULCRO6xxx.md#fulcro6021`:
what it means, what usually causes it, and what to write instead.

## An error inside another one

Some errors are found one level inside what you called. Converting a struct
converts each of its fields, and a field that refuses its value refuses the
whole struct. The error keeps the field's code and its class, and gains the
place it was found:

```text
RangeError: FULCRO6031: Particle.from: field 'charge': UnsignedInteger<8>.from: 300 is outside [0, 255].
```

The original error, as the field raised it, is the `cause`.

## Across a worker

An error thrown inside a worker of `@fulcro/parallel` crosses back as text: a
thread cannot hand over the error object itself. The pool creates it again on
your side. One of the library's own errors comes back with its own code; an
error your task threw comes back as [FULCRO3005](./errors/FULCRO3xxx.md#fulcro3005)
with your message kept word for word.
