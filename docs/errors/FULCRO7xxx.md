# FULCRO7xxx — `@fulcro/memory`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO7xxx.md)

The errors of [storage](../memory.md). Back to [all codes](../errors.md).

## FULCRO7001

```text
RangeError: FULCRO7001: createManagedStorage: expected a length that is a non-negative safe integer, received -1.
```

Details:

```text
{ operation: string; received: number | string }
```

A storage was asked for a length it cannot have: negative, fractional, `NaN`,
or past `Number.MAX_SAFE_INTEGER`. The length is checked before anything is
allocated.

Pass a count. When the length comes from arithmetic — a division, a size read
from a file — round it, and check it before creating the storage.

## FULCRO7002

```text
RangeError: FULCRO7002: ManagedStorage.get: index 3 is outside a storage of length 3.
```

Details:

```text
{ operation: string; index: number | string; length: number }
```

`get` or `set` was given an index that is not an integer from `0` to
`length - 1`. Nothing was read or written: an array would have answered
`undefined`, and a buffer would have read its neighbour's bytes, so the storage
refuses instead.

The usual cause is a loop bound one too far — `index <= length` where
`index < length` was meant — or an index computed as a fraction. Loop to
`storage.length`, and round a computed index.

## FULCRO7003

```text
TypeError: FULCRO7003: createFixedBufferStorage: expected an element type with a name, layout.size, read, write and is; read is missing.
```

Details:

```text
{ operation: string; missing: string }
```

`createFixedBufferStorage` was given something it cannot store values of. It
needs a type that knows its size in bytes and reads and writes itself at an
offset, which is what a [struct](../types.md) is.

A numeric type on its own — `SinglePrecisionFloat`, `SignedInteger(32)` — is
refused here: it checks values but carries no byte encoding of its own. Wrap it
in a struct of one field:

```ts
const Sample = struct('Sample', { value: SinglePrecisionFloat });

createFixedBufferStorage(Sample, 1_000);
```

## FULCRO7004

```text
TypeError: FULCRO7004: FixedBufferStorage.set: the value is not a value of Point.
```

Details:

```text
{ operation: string; element: string }
```

`set` was given a value its struct does not recognise as its own — a plain
object with the right fields, a value of a struct with other fields, or one
whose field is outside its type's range. Nothing was written.

Make the value with the struct itself: `Point.from({ x, y })`. The compiler
already refuses this when the call is typed; it is reached from code that is
not, or through a cast.
