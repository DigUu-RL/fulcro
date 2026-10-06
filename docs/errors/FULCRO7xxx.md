# FULCRO7xxx — `@fulcro/memory`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO7xxx.md)

The errors of [storage, allocators and views](../memory.md). Back to
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

## FULCRO7014

```text
RangeError: FULCRO7014: asView: 3 values from position 8 do not fit in a source of 10.
```

Details:

```text
{
	operation: string;
	start: number | string;
	length: number | string;
	available: number;
}
```

A view was asked for a region that runs outside what it is cut from: a start
before `0` or past the end, a negative length, a length that goes past the
last value, or a position that is not an integer. `asView`, `asReadOnlyView`
and `subview` report it the same way. For `subview`, `available` is the length
of the view, not of its source: a subview stays inside the view it is cut
from. When the length was omitted, `length` is the rest of the source from
`start`.

Nothing was created. Check the start against `source.length` before asking.
To observe everything from a start onwards, omit the length rather than
computing it.

## FULCRO7015

```text
RangeError: FULCRO7015: View.get: position 2 is past the end of the array, which now holds 2 values; it shrank after it was viewed.
```

Details:

```text
{ operation: string; index: number; length: number }
```

A view over an array was read or written at a position the array no longer
reaches: the array shrank — `pop`, `splice`, `length = …` — after the view was
made. `index` is the position in the array, and `length` how long the array is
now. An array would have answered `undefined`, so the view refuses instead.

Make the view again after changing the array's length, or hold the values in a
storage, whose length cannot change.

## FULCRO7016

```text
RangeError: FULCRO7016: Pointer.offset: position 5 is outside 0 to 4, where a pointer into 4 values may point.
```

Details:

```text
{ operation: string; index: number | string; length: number }
```

`pointerTo` or `offset` was asked for a position a pointer cannot take. A
pointer into `length` values may point anywhere from `0` to `length`, the
position one past the last value included, so a loop can step onto the end.
Anything before `0`, beyond that end, or not an integer is refused, and no
pointer is made.

Stop a loop at `cursor.index < source.length` rather than stepping past it.
Reading or writing at the end is a different error,
[`FULCRO7002`](#fulcro7002).

## FULCRO7017

```text
TypeError: FULCRO7017: asView: expected a storage, a view, an array, a pointer or a memory reference, received an object with get but no set.
```

Details:

```text
{ operation: string; expected: string; received: string }
```

`asView`, `asReadOnlyView` or `pointerTo` was given something it cannot reach
into. `expected` lists what that function accepts, and `received` describes
what it got, never its contents. The most common case is the one shown: a
read-only view handed to `asView`, which would write it.

Pass a read-only source to `asReadOnlyView` instead. `pointerTo` takes a
storage, a view or an array, not a pointer: move a pointer with `offset`.

## FULCRO7018

```text
TypeError: FULCRO7018: createLinearMemory: expected an ArrayBuffer or a WebAssembly.Memory that is not shared, received WebAssembly.Memory over a SharedArrayBuffer.
```

Details:

```text
{ operation: string; received: string }
```

A linear memory was asked to span something it cannot address: not an
`ArrayBuffer`, not an object whose `buffer` is one, or a memory whose bytes are
shared between threads. A typed array or a `DataView` is refused too, because
it covers only part of its buffer. `received` names what was handed in, never
its contents. `nativePointerTo` reports an allocation over a
`SharedArrayBuffer` the same way.

Pass the `ArrayBuffer` itself, or the `WebAssembly.Memory` a module exports.
A shared memory is refused on purpose: reading and writing the same bytes from
two threads needs an agreement this package does not make yet.

## FULCRO7019

```text
RangeError: FULCRO7019: NativePointer.at: address 32 is outside 8 to 24, where this pointer may point.
```

Details:

```text
{ operation: string; address: number | string; start: number; end: number }
```

`nativePointerTo` or `at` was asked for an address the pointer cannot hold. A
pointer made from a memory may point anywhere from `0` to the memory's length;
one made from an allocation, from where the allocation starts to where it
ends. The end itself is allowed, so a loop can step onto it. An address that is
not a safe integer — a fraction, `NaN`, a `bigint` from a 64-bit memory — is
refused too, and described rather than shown.

Check the address a module handed you against `memory.byteLength`, and move a
pointer from an allocation only within the bytes you asked for.

## FULCRO7020

```text
RangeError: FULCRO7020: nativePointerTo: address 4 is not a multiple of 8, where a value of Sample may start.
```

Details:

```text
{ operation: string; address: number; alignment: number; element: string }
```

The address is inside the memory, but a value of this type may not start
there: its layout says it starts at a multiple of `alignment`. Reading
misaligned bytes would give an answer, just not the value anybody wrote.

Usually the address is a field offset added to the wrong base, or the
allocation was asked for a smaller alignment than the type's: pass
`Type.layout.alignment` when you allocate the bytes. To read the bytes at that
address as a type that may start there, give `at` that type.

## FULCRO7021

```text
RangeError: FULCRO7021: NativePointer.get: the 8 bytes of Sample at address 16 run past 16, the end of where this pointer may read.
```

Details:

```text
{ operation: string; address: number; size: number; element: string; end: number }
```

A pointer was read or written where the value's bytes do not all fit: at the
end of its memory or its allocation, or close enough to it that the last bytes
fall outside. It also happens when the buffer shrank after the pointer was
made, or was transferred and has no bytes left. `end` is where the pointer may
read up to now.

Stop a loop before the end rather than at it. Over a buffer that resizes, make
sure it is large enough before reading.

## FULCRO7022

```text
TypeError: FULCRO7022: nativePointerTo: expected a linear memory or an allocation, received ArrayBuffer.
```

Details:

```text
{ operation: string; received: string }
```

`nativePointerTo` takes a linear memory and an address, or an allocation. It
was handed something else. A buffer is the case shown: wrap it with
`createLinearMemory` first. An object shaped like a linear memory is not one —
only `createLinearMemory` makes them.

## FULCRO7023

```text
Error: FULCRO7023: borrow: the owner was moved; use the owner move returned.
```

Details:

```text
{ operation: string }
```

An owner was used after it was handed to `move`. The handle `move` spent
refuses everything from then on — `borrow`, `borrowMutable`, `move` and its
`length` — because another owner now holds the same values, and two handles
acting for them would defeat the point of owning them.

Use the owner `move` returned. With [the memory transformer](../memory.md#ownership)
wired up, the same use is refused when the code is compiled, as
[FULCRO7027](#fulcro7027), wherever the old owner is used by name.

## FULCRO7024

```text
Error: FULCRO7024: ReadOnlyView.get: the borrow has ended — its owner was moved, or borrowed again in a way it cannot share; borrow again.
```

Details:

```text
{ operation: string }
```

A borrow, or a subview, a read-only view, a view or a pointer made from one,
was used after something its owner did ended it. A shared borrow ends when the
owner is lent with `borrowMutable`. An exclusive borrow ends when the owner is
lent again, either way. Every borrow ends when the owner is moved.

Borrow again after the conflicting operation, rather than holding on to the
borrow from before it. With the memory transformer wired up, a borrow kept in
a variable is refused when the code is compiled, as
[FULCRO7028](#fulcro7028) or [FULCRO7029](#fulcro7029).

## FULCRO7025

```text
Error: FULCRO7025: own: the storage already has an owner, and a storage is owned once.
```

Details:

```text
{ operation: string }
```

`own` was given a `create` that returned a storage another `own` already took.
A storage has one owner: two would each lend its values for writing while the
other still reads them.

Create the storage inside the function handed to `own` —
`own(() => createManagedStorage(…))` — so that nothing else holds it. To hand
an owner to other code, `move` it.

## FULCRO7026

```text
TypeError: FULCRO7026: own: create returned a borrow, which reaches memory another owner holds; create a storage instead.
```

Details:

```text
{ operation: string }
```

The function handed to `own` returned a borrow. A borrow observes values that
already have an owner, so owning it would give the same memory two owners.

Create a new storage inside the function. To give code the values without
giving it ownership, pass it the borrow itself.

## FULCRO7027

```text
FULCRO7027: move: 'queue' is used after it was moved at line 12; use the owner move returned.
```

Details:

```text
{ operation: string; name: string; line: number }
```

A compile error, at the use, from the memory transformer. The variable was
handed to `move` at the line named, on some path that reaches this use — in a
branch, an earlier iteration of the loop, a `try` that may have run, or a
function created after the move. At runtime the same use throws
[FULCRO7023](#fulcro7023).

Use the owner `move` returned. When the move happens on only one branch, give
the variable a new value on that branch, or move it on every one.

## FULCRO7028

```text
FULCRO7028: borrow: the borrow 'reading' is used after borrowMutable(scores) at line 8 ended it.
```

Details:

```text
{ operation: string; name: string; owner: string; conflict: string; line: number }
```

A compile error, at the use, from the memory transformer. The borrow kept in
the variable was taken from `owner`, and `conflict` — at the line named — lent
the same owner in a way this borrow cannot share: for writing, ending every
borrow before it, or for reading, ending a borrow for writing. A borrow lasts
until its last use, so it is only this later use that is refused. At runtime
the same use throws [FULCRO7024](#fulcro7024).

Finish with the borrow before taking the conflicting one, or borrow again
after it.

## FULCRO7029

```text
FULCRO7029: borrow: the borrow 'reading' is used after its owner 'scores' was moved at line 9.
```

Details:

```text
{ operation: string; name: string; owner: string; line: number }
```

A compile error, at the use, from the memory transformer. The borrow kept in
the variable was taken from an owner that was moved at the line named; every
borrow of an owner ends when it moves. At runtime the same use throws
[FULCRO7024](#fulcro7024).

Borrow from the owner `move` returned.
