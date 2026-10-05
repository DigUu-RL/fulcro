# Memory: `Storage<T>`

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/memory.md)

A value's type says what it is. Where its bytes live is a separate decision, and
this package makes it a separate piece of code: one contract, `Storage<T>`,
that your code is written against, and the strategies that hold the values
behind it.

```sh
npm install @fulcro/memory
```

```ts
import {
	createFixedBufferStorage,
	createManagedStorage,
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

## What it does not do yet

- **Grow.** The length is the one it was created with.
- **Hand out its bytes.** The buffer is private to the storage; a view into it
  is the next feature of this package.
- **Iterate.** Walk it with an index, as above.

## Errors

| Code                                              | When                                                     |
| ------------------------------------------------- | -------------------------------------------------------- |
| [`FULCRO7001`](./errors/FULCRO7xxx.md#fulcro7001) | A length that is not a non-negative safe integer         |
| [`FULCRO7002`](./errors/FULCRO7xxx.md#fulcro7002) | An index outside the storage                             |
| [`FULCRO7003`](./errors/FULCRO7xxx.md#fulcro7003) | An element type a fixed buffer cannot store              |
| [`FULCRO7004`](./errors/FULCRO7xxx.md#fulcro7004) | A value its element type does not recognise, in a buffer |
