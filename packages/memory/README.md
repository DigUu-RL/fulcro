# @fulcro/memory

Where a value's bytes live, and who may reach them. A value's type says what it
is; this package decides where it is held — in ordinary JavaScript memory or in
a buffer of fixed size — without the code that reads it having to know which.

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

## `Storage<T>`

One contract — `length`, `get(index)`, `set(index, value)` — and code written
against it runs over every strategy:

```ts
const total = (prices: Storage<number>): number => {
	let sum = 0;

	for (let index = 0; index < prices.length; index++) sum += prices.get(index);

	return sum;
};
```

| Strategy                   | Holds                                                  |
| -------------------------- | ------------------------------------------------------ |
| `createManagedStorage`     | Any value, as it is, in an ordinary array              |
| `createFixedBufferStorage` | Values of a struct, as bytes, end to end in one buffer |

```ts
const scores = createManagedStorage(3, 0);

const points = createFixedBufferStorage(Point, 1_000_000); // 8 MB, no objects
points.set(0, Point.from({ x: 1, y: 2 }));
```

The structs themselves — and the numeric types their fields are made of — are
[`@fulcro/types`](../types/README.md).

---

**Full guide:** [docs/memory.md](../../docs/memory.md) — choosing a strategy,
what each one costs, and the failure modes worth knowing before you meet them.
