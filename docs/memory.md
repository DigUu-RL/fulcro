# Memory: `Storage<T>` and `Allocator`

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/memory.md)

A value's type says what it is. Where its bytes live is a separate decision, and
this package makes it a separate piece of code: one contract, `Storage<T>`,
that your code is written against, and the strategies that hold the values
behind it. Where the memory itself comes from is a third decision, made by the
[`Allocator`](#allocators) you pass in.

```sh
npm install @fulcro/memory
```

```ts
import {
	allocate,
	createArenaAllocator,
	createFixedBufferStorage,
	createManagedStorage,
	createStackAllocator,
	type Allocation,
	type Allocator,
	type StackAllocator,
	type Storage,
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

## What it does not do yet

- **Grow.** A storage's length is the one it was created with.
- **Hand out its bytes.** A storage's buffer is private to it; a view into it
  is the next feature of this package.
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
