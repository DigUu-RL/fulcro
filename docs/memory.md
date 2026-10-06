# Memory: `Storage<T>`, `Allocator` and `View<T>`

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/memory.md)

A value's type says what it is. Where its bytes live is a separate decision, and
this package makes it a separate piece of code: one contract, `Storage<T>`,
that your code is written against, and the strategies that hold the values
behind it. Where the memory itself comes from is a third decision, made by the
[`Allocator`](#allocators) you pass in. Reaching into values held somewhere
else — a region of them, one position, one value — without copying or owning
them is the [access layer](#views-pointers-and-references). Reaching them by
byte address, the way a WebAssembly module does, is a
[linear memory](#linear-memory-and-native-pointers).

```sh
npm install @fulcro/memory
```

```ts
import {
	allocate,
	asReadOnlyView,
	asView,
	createArenaAllocator,
	createFixedBufferStorage,
	createLinearMemory,
	createManagedStorage,
	createStackAllocator,
	nativePointerTo,
	pointerTo,
	referenceTo,
	type Allocation,
	type Allocator,
	type LinearMemory,
	type MemoryReference,
	type NativePointer,
	type Pointer,
	type ReadOnlyView,
	type StackAllocator,
	type Storage,
	type View,
} from '@fulcro/memory';
```

## The contract

A storage holds a fixed number of values of one type, by index:

```ts
interface Storage<T> {
	readonly length: number;
	get(index: number): T;
	set(index: number, value: T): void;
}
```

Write code against that, and it runs unchanged over every strategy:

```ts
const total = (prices: Storage<number>): number => {
	let sum = 0;

	for (let index = 0; index < prices.length; index++) sum += prices.get(index);

	return sum;
};
```

`total` never learns whether the prices sit in an ordinary array or in a
buffer of bytes, and a strategy added later reaches it without it changing.

The length is fixed when the storage is created. An index is an integer from
`0` to `length - 1`, and anything else — `-1`, `length`, `1.5`, `NaN` — throws
a `RangeError` with code [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002). It
is never read as `undefined`, and never written past the end.

A storage is a frozen object of plain functions, so `get` and `set` can be
passed around on their own:

```ts
const { get } = createManagedStorage(3, 0);
```

## Choosing a strategy

| You need to hold                                         | Use                        |
| -------------------------------------------------------- | -------------------------- |
| Any value: objects, strings, functions, `null`           | `createManagedStorage`     |
| Many values of a struct, as bytes rather than as objects | `createFixedBufferStorage` |

## `createManagedStorage`

Memory the JavaScript engine manages: an ordinary array, behind the contract.

```ts
const scores: Storage<number> = createManagedStorage(3, 0);

scores.set(1, 42);
scores.get(1); // 42
```

The second argument is the value every position holds until it is set, and the
type is inferred from it. Pass the type explicitly when the positions will hold
more than the initial value's type:

```ts
const users = createManagedStorage<User | null>(100, null);
```

Values are held **as they are**: `get` returns the very object `set` was given,
not a copy, and nothing inside a value is ever read.

**Watch the initial value.** It is one value, held at every position — not a
fresh one per position. With an object, every position starts out as the same
object:

```ts
const lists = createManagedStorage(3, [] as string[]);

lists.get(0).push('a');
lists.get(2); // ['a'] — the same array
```

Start from `null` and `set` each position instead, when each one needs its own.

## `createFixedBufferStorage`

One buffer of fixed size, every value stored as its bytes, end to end. The
element type is a [struct](./types.md) from `@fulcro/types`:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

const points: Storage<Point> = createFixedBufferStorage(Point, 1_000_000);

points.set(0, Point.from({ x: 1, y: 2 }));
points.get(0).x; // 1
```

**What it costs.** The buffer is allocated once, `length × Point.layout.size`
bytes — eight million here — and nothing else. No object is made at creation:
a million points cost the bytes, not a million objects.

**Every position starts at zero.** The buffer is zeroed, so a position nobody
has set reads as the struct with every field zero.

**A read makes a new value.** `get` reads the bytes and builds a frozen value
from them, a new one on every call. Two reads of the same index are equal by
`Point.equals`, but not `===`. And `set` stores the bytes, not the object: the
value you passed in is not the one you get back.

**A value of the wrong type is refused.** `set` asks the struct whether the
value is one of its own, and throws a `TypeError` with code
[`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) before a byte is written when
it is not. The compiler already refuses a plain object where a `Point` is
expected; this is for the value that arrives from code without types.

**Only structs, for now.** A numeric type on its own — `SinglePrecisionFloat`,
`SignedInteger(32)` — carries no byte encoding of its own, and is refused with
[`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003). Wrap it in a struct of one
field:

```ts
const Sample = struct('Sample', { value: SinglePrecisionFloat });
const samples = createFixedBufferStorage(Sample, 44_100);
```

A struct's methods come back with every value read, and structs nest, `Decimal`
fields included — anything a struct can hold, a fixed buffer can store.

## Allocators

`createFixedBufferStorage` makes its own buffer. When you want to choose where
the memory comes from — one that is released all at once at the end of a
frame, or one carved out of a budget fixed in advance — ask an allocator for
it, and pass the allocator in:

```ts
const step = (stack: StackAllocator): void => {
	using frame = stack.enter();
	const particles: Storage<Particle> = allocate(Particle, 10_000, frame);

	// …
}; // every particle is released here, at once
```

`allocate(element, length, allocator)` returns a `Storage<T>` exactly like
`createFixedBufferStorage` does — the values held as bytes, end to end,
starting at zero. Only the memory's origin changes, and code reading the
storage cannot tell.

### The `Allocator` contract

```ts
interface Allocator {
	allocate(size: number, alignment: number): Allocation;
}

interface Allocation {
	readonly bytes: DataView; // exactly `size` bytes, zeroed
	isLive(): boolean;
}
```

`size` is a byte count; `alignment` is a power of two that the first byte's
position must be a multiple of. `allocate` reads both from the element's
layout, so you only pass them when you ask an allocator for raw bytes:

```ts
const header: Allocation = arena.allocate(16, 8);

header.bytes.setFloat64(0, Date.now());
```

That is all an allocator promises. How memory goes back differs from one
strategy to the next — all at once, last in first out, one block at a time, or
never — so each strategy has its own methods for it, and none carries a `free`
it would have to refuse.

Code that needs memory takes an `Allocator` and leaves the choice to its
caller:

```ts
const createParticles = (
	count: number,
	allocator: Allocator,
): Storage<Particle> => allocate(Particle, count, allocator);
```

### Choosing an allocator

| Your allocations…                              | Use                          | Released by            |
| ---------------------------------------------- | ---------------------------- | ---------------------- |
| …have no lifetime worth managing               | `createManagedAllocator()`   | the garbage collector  |
| …all end together: one request, one pass       | `createArenaAllocator(size)` | `reset()`, or `using`  |
| …nest, the inner ones ending first             | `createStackAllocator(size)` | leaving a frame        |
| …must fit a budget fixed in advance            | `createFixedBufferAllocator` | `reset()`              |
| …are all one size and come and go in any order | `createPoolAllocator`        | `deallocate(each one)` |

**Managed.** `createManagedAllocator()` gives every allocation a buffer of its
own and never releases one: the garbage collector reclaims an allocation once
nothing holds it. Pass it when nothing about the situation calls for anything
else.

**Arena.** `createArenaAllocator(chunkSize)` reserves memory `chunkSize` bytes
at a time and hands it out front to back. `reset()` releases everything at
once, and keeps the chunks, so the next pass asks the engine for no memory at
all. It is also an allocation domain: entered with `using`, it resets when the
scope ends. It grows: a full chunk is followed by another, and a request
larger than a chunk gets a chunk of its own size.

```ts
const arena = createArenaAllocator(64 * 1024);

for (const request of requests) {
	const scratch = allocate(Sample, request.length, arena);
	// …
	arena.reset();
}
```

**Stack.** `createStackAllocator(capacity)` holds one buffer of `capacity`
bytes and never grows. `stack.enter()` opens a frame; allocating from the frame
reserves memory that lasts until the frame is left, at the end of its `using`
scope — however the scope ends, a throw included. Frames nest, and only the
innermost open one may allocate or be left; `using` keeps that order on its
own. Allocating from the stack itself, outside any frame, reserves memory that
lasts as long as the stack.

**Fixed buffer.** `createFixedBufferAllocator(buffer)` hands out an
`ArrayBuffer` you already have and never asks the engine for memory. `reset()`
starts again from the front. What the buffer held before is overwritten with
zeroes as it is handed out.

**Pool.** `createPoolAllocator(blockSize, blockCount)` cuts one buffer into
`blockCount` blocks of `blockSize` bytes. Each allocation takes one block and
`deallocate(allocation)` returns it, in any order. A request fits when its size
is at most `blockSize` and its alignment divides `blockSize`.

Each factory returns its allocator under its own type — `ArenaAllocator`,
`StackAllocator`, `FixedBufferAllocator`, `PoolAllocator` — which is
`Allocator` plus the methods that give memory back. `createManagedAllocator`
returns a plain `Allocator`, since it has nothing to give back. Take the
specific type where you call those methods, and `Allocator` everywhere else.

### Allocation domains

An `AllocationDomain` is an allocator that is also `Disposable`: leaving its
`using` scope releases its whole region at once. An arena is one, and so is
every frame of a stack. Leaving costs the same whatever was allocated — nothing
is released one allocation at a time.

### Released memory is refused, not read

Releasing does not take memory away from whoever still holds it: the bytes stay
there, and the allocator hands them to the next request. So every allocation
can say whether it is still its own — `isLive()` turns `false` the moment its
memory is released, and stays false after the bytes are handed out again — and
a storage from `allocate` asks before every `get` and `set`:

```ts
const arena = createArenaAllocator(1024);
const before = allocate(Particle, 1, arena);

arena.reset();
const after = allocate(Particle, 1, arena); // the same bytes
after.set(0, Particle.from({ x: 7, y: 7 }));

before.get(0); // throws FULCRO7009 — never reads after's particle
```

It costs one comparison per access. It does not cover the `bytes` of an
allocation you asked for directly: check `isLive()` yourself before reading
them once a release may have happened.

### Writing an allocator of your own

Anything with an `allocate(size, alignment)` that returns `{ bytes, isLive }` is
an allocator, and `allocate` and every function written against `Allocator`
accept it without this package changing. Honour the contract in full: exactly
`size` bytes, zeroed, starting at a multiple of `alignment`, never shared with
another live allocation, and `isLive()` false from the moment they are
released.

## Views, pointers and references

A storage owns its values. Code that only has to reach some of them — sum a
range, fill the second half, bump one counter — should not need the whole
storage, and should not get a copy either. Three types do that reaching, and
none of them owns anything:

```text
Pointer<T>          where one value is
View<T>             where a region starts, and how long it is
MemoryReference<T>  one value that can be read and replaced
```

### `View<T>` and `ReadOnlyView<T>`

```ts
interface ReadOnlyView<T> {
	readonly length: number;
	get(index: number): T;
	subview(start: number, length?: number): ReadOnlyView<T>;
}

interface View<T> extends ReadOnlyView<T> {
	set(index: number, value: T): void;
	subview(start: number, length?: number): View<T>;
	readOnly(): ReadOnlyView<T>;
}
```

`asView(source, start?, length?)` observes a region of a storage, of another
view or of an array:

```ts
const scores: Storage<number> = createManagedStorage(100, 0);
const firstTen: View<number> = asView(scores, 0, 10);
const rest: View<number> = asView(scores, 10); // positions 10 to 99

firstTen.set(3, 42);
scores.get(3); // 42 — the view wrote the storage
```

Nothing is copied, at any length. A view remembers its source, where its region
starts and how long it is; every `get` and `set` goes to the source, so the
view and the source never disagree. `subview` cuts a part of a view the same
way, and a subview of a subview reads the original source directly, so nesting
them costs nothing on each access.

An index is a position inside the view, from `0` to `length - 1`, and anything
else throws [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) — even where the
source goes on past the view. A region that does not fit inside its source
throws [`FULCRO7014`](./errors/FULCRO7xxx.md#fulcro7014). An empty region is
allowed anywhere, the end included, as in an array.

A view has the shape of a `Storage<T>`, so every function written against the
contract accepts one:

```ts
total(asView(prices, 10, 5)); // the `total` from the contract above
```

**Read-only.** `asReadOnlyView(source, start?, length?)` and `view.readOnly()`
return a `ReadOnlyView<T>`, the thing to hand to code that should only read. It
has no `set`, in its type and at runtime. The object has no such property, so a
cast does not get the right to write back. It also accepts a `readonly` array
and another read-only view, which `asView` refuses because it would write them.

**Over an array.** The array is observed in place. It can shrink afterwards,
which a storage cannot, and a position it no longer reaches throws
[`FULCRO7015`](./errors/FULCRO7xxx.md#fulcro7015) rather than reading
`undefined`. A view keeps the length it was made with when the array grows.

**It does not outlive the memory.** Over a storage from `allocate`, every access
still checks whether the allocator released the bytes, and throws
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) once it has, exactly as the
storage would. A view owns nothing, so it has nothing to release.

### `Pointer<T>`

`pointerTo(source, index)` points at one position of a storage, a view or an
array:

```ts
const queue: Storage<string> = createManagedStorage(8, '');
const head: Pointer<string> = pointerTo(queue, 0);

head.set('first');
head.offset(1).set('second');
queue.get(1); // 'second'
```

`offset(delta)` returns a new pointer, forwards or back, and leaves the one it
came from as it was. A pointer may stand one past the last value, so a loop can
step onto the end and stop there:

```ts
for (
	let cursor = pointerTo(queue, 0);
	cursor.index < queue.length;
	cursor = cursor.offset(1)
) {
	cursor.get();
}
```

Reading or writing at the end throws `FULCRO7002`. Pointing outside `0` to the
length throws [`FULCRO7016`](./errors/FULCRO7xxx.md#fulcro7016).
`asView(pointer, length)` observes the region that starts at the pointer: one
value when the length is omitted.

### `MemoryReference<T>`

`referenceTo(value)` makes one value that can be read and replaced. Hand it to
code that has to change a value it does not own:

```ts
const increment = (counter: MemoryReference<number>): void => {
	counter.set(counter.get() + 1);
};

const hits = referenceTo(0);

increment(hits);
hits.get(); // 1
```

The value is held as it is, never copied. A reference has no position and no
arithmetic. That is what a pointer adds, and every `Pointer<T>` is a
`MemoryReference<T>` too, so `increment(pointerTo(queue, 3))` works.
`asView(reference)` observes it as a view of length `1`.

### What a source can be

| Source                   | `asView` | `asReadOnlyView` | `pointerTo` |
| ------------------------ | -------- | ---------------- | ----------- |
| A `Storage<T>`, any kind | yes      | yes              | yes         |
| A `View<T>`              | yes      | yes              | yes         |
| A `ReadOnlyView<T>`      | no       | yes              | no          |
| A `T[]`                  | yes      | yes              | yes         |
| A `readonly T[]`         | no       | yes              | no          |
| A `Pointer<T>`           | yes      | yes              | no          |
| A `MemoryReference<T>`   | yes      | yes              | no          |

Anything else throws [`FULCRO7017`](./errors/FULCRO7xxx.md#fulcro7017). A
storage or a reference written outside this package is accepted by its shape,
exactly like one made here.

## Linear memory and native pointers

A `Pointer<T>` counts values. Some code needs to count bytes instead: point at
one field in the middle of a struct, read the same bytes as another type, or
read what a WebAssembly module wrote at an address it returned. For that,
Fulcro sees a block of bytes as one address space — a **linear memory**, in
which address `0` is the first byte — and points into it by byte address.

```ts
interface LinearMemory {
	readonly byteLength: number;
}

interface NativePointer<T> extends MemoryReference<T> {
	readonly memory: LinearMemory;
	readonly address: number;
	get(): T;
	set(value: T): void;
	at(byteOffset: number): NativePointer<T>;
	at<TOther>(
		byteOffset: number,
		element: AlignedElement<TOther>,
	): NativePointer<TOther>;
}
```

### `createLinearMemory`

`createLinearMemory(backing)` spans an `ArrayBuffer`, or the
`WebAssembly.Memory` a module exports:

```ts
const { instance } = await WebAssembly.instantiate(bytes);
const moduleExports = instance.exports as {
	memory: WebAssembly.Memory;
	latest: () => number;
};
const memory: LinearMemory = createLinearMemory(moduleExports.memory);

memory.byteLength; // 65536, one page
```

TypeScript types each export of a module as any kind of export at all —
function, memory, table or global — so say which one each is, as above, before
handing it on.

Nothing is copied, and the memory stays its owner's: the module goes on using
it as before. `byteLength` is the length now, and goes up when the module
grows its memory or a resizable buffer resizes.

A memory shared between threads is refused, a `SharedArrayBuffer` or a shared
`WebAssembly.Memory`, with
[`FULCRO7018`](./errors/FULCRO7xxx.md#fulcro7018). So is a typed array, which
covers only part of its buffer. Pass the buffer itself.

### `nativePointerTo(memory, address, element)`

Points at a byte address of a memory, at a value of the element type — a
struct, as for `allocate`:

```ts
const latest: NativePointer<Reading> = nativePointerTo(
	memory,
	moduleExports.latest(),
	Reading,
);

latest.get(); // the reading the module wrote, read where it wrote it
latest.set(Reading.from({ value: 0 })); // and the module sees this
```

`at(byteOffset)` moves the pointer by bytes, forwards or back, and leaves the
one it came from as it was. Give it a type as well, and it reads the bytes
there as that type. That is how a pointer reaches one field of a struct, in
place:

```ts
const particle: NativePointer<Particle> = nativePointerTo(memory, 64, Particle);
const velocity: NativePointer<Point> = particle.at(
	Particle.layout.fields.velocity.offset,
	Point,
);

velocity.set(Point.from({ x: 0, y: -9.8 })); // writes the particle's velocity
```

An address is an integer from `0` to the memory's length; the length itself is
allowed, so a loop can step onto the end. Anything else throws
[`FULCRO7019`](./errors/FULCRO7xxx.md#fulcro7019). An address must also be a
multiple of the type's alignment, or it throws
[`FULCRO7020`](./errors/FULCRO7xxx.md#fulcro7020). Reading or writing where the
value's bytes do not all fit throws
[`FULCRO7021`](./errors/FULCRO7xxx.md#fulcro7021).

**It follows the memory as it grows.** Growing a WebAssembly memory replaces
its buffer and leaves every view of the old one empty. A native pointer holds
the memory and the address, never a view, so it reads the current bytes on
every access. That costs one property read per access; a new view is made only
after a growth, not on every access.

**Nothing watches over the address.** A pointer made from a memory may reach
any byte of it, and trusts that a value of its type is there. That is what an
address handed over by a module is. When the bytes came from an allocator,
point at the allocation instead.

### `nativePointerTo(allocation, element)`

Points at the first byte of an allocation:

```ts
const allocation = arena.allocate(Header.layout.size, Header.layout.alignment);
const header: NativePointer<Header> = nativePointerTo(allocation, Header);

header.set(Header.from({ version: 2, length: 0 }));
arena.reset();
header.get(); // throws FULCRO7009 — the bytes are the arena's again
```

Every allocator works, one you wrote included: the memory is the buffer the
allocation was carved from, and the address is where the allocation starts in
it. Two allocations from one arena may sit in different buffers, so compare
addresses only within one memory.

Such a pointer, and every pointer moved from it, reaches only the allocation's
bytes. A move past them throws `FULCRO7019`. Before every read and write it
asks the allocation whether it is still live, and throws
[`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) once the allocator released
it — one comparison per access, as for a storage from `allocate`. Ask the
allocator for the type's alignment: an allocation that starts where the type
may not throws `FULCRO7020`.

## What it does not do yet

- **Grow.** A storage's length is the one it was created with.
- **Hand out its bytes.** A storage's buffer is private to it, and a view
  reads values, not bytes. A view over raw bytes is planned with binary
  serialization.
- **Share memory between threads.** A shared linear memory is refused until
  the package can say who may write what, and when.
- **Address more than a 32-bit memory.** Addresses are numbers; a 64-bit
  memory's addresses are `bigint`s, and are refused.
- **Iterate.** Walk it with an index, as above.
- **Allocate outside the engine's memory.** Every allocator hands out bytes of
  an `ArrayBuffer`.

## Errors

| Code                                              | When                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| [`FULCRO7001`](./errors/FULCRO7xxx.md#fulcro7001) | A length or a block count that is not a count            |
| [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) | An index outside the storage                             |
| [`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003) | An element type that cannot be stored as bytes           |
| [`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) | A value its element type does not recognise, in a buffer |
| [`FULCRO7005`](./errors/FULCRO7xxx.md#fulcro7005) | A size in bytes that is not a count                      |
| [`FULCRO7006`](./errors/FULCRO7xxx.md#fulcro7006) | An alignment that is not a power of two                  |
| [`FULCRO7007`](./errors/FULCRO7xxx.md#fulcro7007) | An allocator with no room left for a request             |
| [`FULCRO7008`](./errors/FULCRO7xxx.md#fulcro7008) | A stack frame used while a frame above it is open        |
| [`FULCRO7009`](./errors/FULCRO7xxx.md#fulcro7009) | Memory used after its allocator released it              |
| [`FULCRO7010`](./errors/FULCRO7xxx.md#fulcro7010) | A request a pool's blocks cannot hold                    |
| [`FULCRO7011`](./errors/FULCRO7xxx.md#fulcro7011) | An allocation returned to a pool that did not make it    |
| [`FULCRO7012`](./errors/FULCRO7xxx.md#fulcro7012) | A stack frame allocated from after it was left           |
| [`FULCRO7013`](./errors/FULCRO7xxx.md#fulcro7013) | Something other than an `ArrayBuffer` for a fixed buffer |
| [`FULCRO7014`](./errors/FULCRO7xxx.md#fulcro7014) | A region that does not fit inside its source             |
| [`FULCRO7015`](./errors/FULCRO7xxx.md#fulcro7015) | A position an array shrank past after it was viewed      |
| [`FULCRO7016`](./errors/FULCRO7xxx.md#fulcro7016) | A pointer outside `0` to its source's length             |
| [`FULCRO7017`](./errors/FULCRO7xxx.md#fulcro7017) | Something that is not a source a view can be made over   |
| [`FULCRO7018`](./errors/FULCRO7xxx.md#fulcro7018) | A linear memory over something unaddressable, or shared  |
| [`FULCRO7019`](./errors/FULCRO7xxx.md#fulcro7019) | A native pointer outside where it may point              |
| [`FULCRO7020`](./errors/FULCRO7xxx.md#fulcro7020) | An address the pointer's type may not start at           |
| [`FULCRO7021`](./errors/FULCRO7xxx.md#fulcro7021) | A value whose bytes run past where a pointer may read    |
| [`FULCRO7022`](./errors/FULCRO7xxx.md#fulcro7022) | Neither a linear memory nor an allocation, to point into |
