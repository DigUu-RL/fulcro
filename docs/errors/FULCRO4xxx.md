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

Details:

```text
{ operation: string }
```

The transformer did not answer `keysOf<T>()`. Besides a transformer that did
not run, `T` may have no keys to read: a primitive, a union, or a generic
parameter that is not substituted yet.

## FULCRO4002

```text
Error: FULCRO4002: is<T>() was not resolved at compile time. …
```

Details:

```text
{ operation: string }
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

Details:

```text
{ operation: string }
```

`defaultOf<T>()` reached runtime. It has no runtime form at all: the call is
always replaced by the value it describes, and only the transformer can do that.

## FULCRO4004

```text
Error: FULCRO4004: typeOf<T>() was not resolved at compile time. …
```

Details:

```text
{ operation: string }
```

The type-argument form of `typeOf` reached runtime unanswered. The form taking a
value, `typeOf(value)`, needs no transformer and works as it is.

## FULCRO4005

```text
Error: FULCRO4005: pathsOf<T>() was not resolved at compile time. …
```

Details:

```text
{ operation: string }
```

The transformer did not answer `pathsOf<T>()`. Besides a transformer that did
not run, `T` may have no paths to walk: a primitive, or a generic parameter
that is not substituted yet.

## FULCRO4006

```text
TypeError: FULCRO4006: as<Order>() refused a value of type string.
```

Details:

```text
{ operation: string; named: string; received: string }
```

`as<T>()` was given a value that is not a `T`, and could say no more than what
kind of value it was — the whole value is the wrong shape.

Use `is<T>()` to branch on the answer instead of stopping.

## FULCRO4007

```text
TypeError: FULCRO4007: as<Order>() refused a value: customer.email: expected string, got number
```

Details:

```text
{ operation: string; named: string; where: string }
```

`as<T>()` was given a value that is not a `T`, and the message names the first
place it differs.

## FULCRO4008

```text
Error: FULCRO4008: nameOf<T>() names a type, which only exists at compile time. …
```

Details:

```text
{ operation: string }
```

The type-argument form of `nameOf` reached runtime. The forms taking a value or
an accessor, `nameOf(value)` and `nameOf(() => order.total)`, need no
transformer.

## FULCRO4009

```text
Error: FULCRO4009: sizeOf<T>() reads the layout a type declares, which only exists at compile time. …
```

Details:

```text
{ operation: string; call: string }
```

`sizeOf<T>()`, `alignOf<T>()`, `offsetOf<T>(field)` or `layoutOf<T>()`
reached runtime unanswered. Besides a transformer that did not run, `T` may not
be one concrete type: a generic parameter has no layout until it is
substituted, and a union of types with different layouts has no single one.
`offsetOf` is also left unanswered when its field is not written as a string
literal, such as a variable holding the name.

## FULCRO4010

```text
FULCRO4010: constantOf(…) cannot be evaluated at compile time: 'counter' is declared with let or var, so it can change. …
```

Details:

```text
{ operation: string; call: string; reason: string }
```

A compile error, at the call. The transformer evaluates `constantOf` only when
it can prove the function constant: every name it reads from outside itself is
a `const`, a function, or one of the built-ins whose answer depends on nothing
but their arguments. The message names the first name that is not, and why:
a `let`, a parameter of an enclosing function, a class, `Date`, or a value
declared only in a `.d.ts` — which includes everything imported from another
package, whose source the compiler never sees.

Make what the function reads a `const` in your own source, or compute the value
at runtime without `constantOf`.

## FULCRO4011

```text
TypeError: FULCRO4011: constantOf(…) produced an instance of Map, which cannot be written as a literal. …
```

Details:

```text
{ operation: string; call: string; received: string }
```

The function given to `constantOf` returned something a literal cannot write: a
function, a symbol, a class instance, an array with holes or extra properties,
an object with a getter or symbol keys, or an object reached twice — shared, or
a cycle. Raised at compile time as a compile error, and at runtime by the same
rule, so a call answers alike with and without the transformer.

Return plain data: numbers, strings, booleans, bigints, `null`, `undefined`,
and arrays and plain objects of them.

## FULCRO4012

```text
FULCRO4012: constantOf(…) threw while it was evaluated at compile time: refused on purpose
```

Details:

```text
{ operation: string; call: string; thrown: string }
```

A compile error: the function given to `constantOf` threw while the
transformer ran it. The message after the colon is what it threw. `Math.random`
is removed from the context it runs in, so calling it lands here.

## FULCRO4013

```text
FULCRO4013: constantOf(…) did not finish within 5000 ms at compile time.
```

Details:

```text
{ operation: string; call: string; milliseconds: number }
```

A compile error: the function given to `constantOf` ran past the limit and was
stopped, rather than leaving the build hanging.

## FULCRO4014

```text
TypeError: FULCRO4014: constantOf: expected a function, received number.
```

Details:

```text
{ operation: string; received: string }
```

`constantOf` was given something other than a function, at runtime. The
transformer refuses the same call at compile time with FULCRO4010.
