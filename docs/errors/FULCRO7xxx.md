# FULCRO7xxx — `@fulcro/memory`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO7xxx.md)

The errors of [storage and allocators](../memory.md). Back to
[all codes](../errors.md).

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
allocated. `createPoolAllocator` reports its block count the same way, since it
is a count too.

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

`createFixedBufferStorage` or `allocate` was given something it cannot store
values of. It needs a type that knows its size in bytes and reads and writes
itself at an offset, which is what a [struct](../types.md) is.

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

## FULCRO7005

```text
RangeError: FULCRO7005: ArenaAllocator.allocate: expected a size in bytes that is a non-negative safe integer, received -1.
```

Details:

```text
{ operation: string; received: number | string }
```

An allocator was asked for a number of bytes it cannot reserve — negative,
fractional, `NaN`, or past `Number.MAX_SAFE_INTEGER` — or was created with a
chunk size, a capacity or a block size like that. Nothing was reserved.

Pass a byte count. When it is computed — `length × size` — check the factors:
a length that is already wrong is usually the cause. `allocate` checks the
length first, so a storage of a bad length fails with
[`FULCRO7001`](#fulcro7001) before it reaches the allocator.

## FULCRO7006

```text
RangeError: FULCRO7006: StackAllocator.allocate: expected an alignment that is a positive power of two, received 3.
```

Details:

```text
{ operation: string; received: number | string }
```

An allocator was asked to align bytes to something that is not `1`, `2`, `4`,
`8` and so on. Every layout's alignment is a power of two, so any other number
describes no position a type can need, and is usually a size passed where the
alignment goes: `arena.allocate(8, 24)` for `arena.allocate(24, 8)`.

`allocate` reports an element whose `layout.alignment` is missing or invalid
the same way, before it asks the allocator for anything. A struct always
carries one.

## FULCRO7007

```text
RangeError: FULCRO7007: StackAllocator.allocate: 29 bytes aligned to 4 were requested, but only 29 of 32 bytes remain.
```

Details:

```text
{
	operation: string;
	requested: number;
	alignment: number;
	available: number;
	capacity: number;
}
```

A stack, a fixed buffer or a pool has no room left for the request. The first
two never grow and a pool has a fixed number of blocks, so the allocator
refuses rather than reach past its memory. Nothing was reserved.

`available` is what remains before alignment: a request can be refused with
as many bytes free as it asked for, because its start had to move forward to
the next multiple of `alignment` — as in the example, where the first free
byte is at `3` and the request has to start at `4`.

Release something first — leave a frame, `reset()`, `deallocate` a block — or
give the allocator more memory. When the amount is not known in advance, an
arena grows and a managed allocator always has room.

## FULCRO7008

```text
Error: FULCRO7008: StackAllocator.enter().allocate: frame 1 is not the innermost open frame, 2; frames are allocated from and left in last-in, first-out order.
```

Details:

```text
{ operation: string; depth: number; innermost: number }
```

A stack frame — or the stack itself, which is frame `0` — was used while a
frame above it is still open. Allocating from it would put memory it owns
inside memory the inner frame is about to release, and leaving it would
release the inner frame's memory from under it. Nothing changed.

Leave the inner frame first. With `using`, frames are left in the right order
on their own; this is reached by calling `[Symbol.dispose]()` by hand, or by
holding on to an outer frame and allocating from it inside an inner scope.

## FULCRO7009

```text
Error: FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.
```

Details:

```text
{ operation: string }
```

A storage from `allocate` was read or written after its allocator released
its memory — an arena reset, the frame it was allocated in left, its pool
block returned. The bytes are still there, and may already belong to another
allocation, so the storage refuses rather than read someone else's values.

`PoolAllocator.deallocate` reports the same thing when an allocation is
returned a second time.

Keep the storage inside the scope its memory lives in: allocate it from the
frame or arena whose lifetime matches it, or from a managed allocator when it
has to outlive them.

## FULCRO7010

```text
RangeError: FULCRO7010: PoolAllocator.allocate: 49 bytes aligned to 8 do not fit a pool block of 48 bytes.
```

Details:

```text
{ operation: string; requested: number; alignment: number; blockSize: number }
```

A pool was asked for more bytes than one block holds, or for an alignment
its blocks cannot promise. Every block starts at a multiple of `blockSize`, so
the alignment must divide `blockSize`: blocks of 48 bytes can be aligned to
16, not to 32.

Create the pool with blocks as large as the largest request, rounded up to a
multiple of its alignment — or use another allocator for the requests that
are not the pool's size.

## FULCRO7011

```text
Error: FULCRO7011: PoolAllocator.deallocate: the allocation was not made by this allocator.
```

Details:

```text
{ operation: string }
```

`deallocate` was given an allocation another allocator made — another pool,
an arena, anything else. Taking it would put a block that is not the pool's
on its free list. Nothing changed.

Return each allocation to the pool that made it.

## FULCRO7012

```text
Error: FULCRO7012: StackAllocator.enter().allocate: frame 1 was already left; enter a new one.
```

Details:

```text
{ operation: string; depth: number }
```

A stack frame was allocated from after it was left. Its memory went back to
the stack when it was left, so there is nothing for it to hand out.

Call `stack.enter()` again for a new frame. This is reached by keeping a
frame past the end of its `using` scope — returning it, or storing it.

## FULCRO7013

```text
TypeError: FULCRO7013: createFixedBufferAllocator: expected an ArrayBuffer, received SharedArrayBuffer.
```

Details:

```text
{ operation: string; received: string }
```

`createFixedBufferAllocator` was given something other than an
`ArrayBuffer`: a typed array, a `SharedArrayBuffer`, a number. `received` names
what it was, never its value.

Pass the buffer itself — `array.buffer` for a typed array, keeping in mind it
may be larger than the array — or `new ArrayBuffer(size)`.
