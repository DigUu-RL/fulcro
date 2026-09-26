# FULCRO4xxx — `@fulcro/reflect`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO4xxx.md)

The errors of [reflection](../reflect.md). Back to [all codes](../errors.md).

Most of these share one cause: a utility that answers from a type reached
runtime without the transformer having answered first. A type exists only at
compile time, so at runtime there is nothing left to read, and the utility
refuses rather than guess. The fix is the same for each — wire up the
transformer, as [Reflection](../reflect.md) describes — and each page below
says what else can cause it.

## FULCRO4001

```text
Error: FULCRO4001: keysOf<T>() was not resolved at compile time. …
```

The transformer did not answer `keysOf<T>()`. Besides a transformer that did
not run, `T` may have no keys to read: a primitive, a union, or a generic
parameter that is not substituted yet.

## FULCRO4002

```text
Error: FULCRO4002: is<T>() was not resolved at compile time. …
```

The transformer did not answer `is<T>()` or `as<T>()` — the message names which.
Besides a transformer that did not run, `T` may have nothing to check at
runtime: an index signature, or a generic parameter that is not substituted
yet.

Pass a test of your own as the second argument where the type cannot be read.

## FULCRO4003

```text
Error: FULCRO4003: defaultOf<T>() resolves a type, which only exists at compile time. …
```

`defaultOf<T>()` reached runtime. It has no runtime form at all: the call is
always replaced by the value it describes, and only the transformer can do that.

## FULCRO4004

```text
Error: FULCRO4004: typeOf<T>() was not resolved at compile time. …
```

The type-argument form of `typeOf` reached runtime unanswered. The form taking a
value, `typeOf(value)`, needs no transformer and works as it is.

## FULCRO4005

```text
Error: FULCRO4005: pathsOf<T>() was not resolved at compile time. …
```

The transformer did not answer `pathsOf<T>()`. Besides a transformer that did
not run, `T` may have no paths to walk: a primitive, or a generic parameter
that is not substituted yet.

## FULCRO4006

```text
TypeError: FULCRO4006: as<Order>() refused a value of type string.
```

`as<T>()` was given a value that is not a `T`, and could say no more than what
kind of value it was — the whole value is the wrong shape.

Use `is<T>()` to branch on the answer instead of stopping.

## FULCRO4007

```text
TypeError: FULCRO4007: as<Order>() refused a value: customer.email: expected string, got number
```

`as<T>()` was given a value that is not a `T`, and the message names the first
place it differs.

## FULCRO4008

```text
Error: FULCRO4008: nameOf<T>() names a type, which only exists at compile time. …
```

The type-argument form of `nameOf` reached runtime. The forms taking a value or
an accessor, `nameOf(value)` and `nameOf(() => order.total)`, need no
transformer.

## FULCRO4009

```text
Error: FULCRO4009: sizeOf<T>() reads the layout a type declares, which only exists at compile time. …
```

`sizeOf<T>()`, `alignOf<T>()`, `offsetOf<T>(field)` or `layoutOf<T>()`
reached runtime unanswered. Besides a transformer that did not run, `T` may not
be one concrete type: a generic parameter has no layout until it is
substituted, and a union of types with different layouts has no single one.
`offsetOf` is also left unanswered when its field is not written as a string
literal, such as a variable holding the name.
