# @fulcro/memory

Where a value's bytes live, and who may reach them. A value's type says what it
is; this package decides where it is held — in ordinary JavaScript memory or in
bytes from an allocator you choose — without the code that reads it having to
know which.

```sh
npm install @fulcro/memory
```

```ts
import {
	allocate,
	asView,
	createFixedBufferStorage,
	createManagedStorage,
	createStackAllocator,
	pointerTo,
	referenceTo,
	type MemoryReference,
	type Pointer,
	type StackAllocator,
	type Storage,
	type View,
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

## `Allocator`

Where the memory comes from is chosen at the call site. `allocate` returns a
`Storage<T>` from whichever allocator you pass:

```ts
const step = (stack: StackAllocator): void => {
	using frame = stack.enter();
	const particles = allocate(Particle, 10_000, frame);
	// …
}; // released here, all at once
```

| Allocator                    | Memory goes back                          |
| ---------------------------- | ----------------------------------------- |
| `createManagedAllocator`     | When the garbage collector reclaims it    |
| `createArenaAllocator`       | All at once, on `reset()` or with `using` |
| `createStackAllocator`       | A frame at a time, last in first out      |
| `createFixedBufferAllocator` | All at once, on `reset()`, in your buffer |
| `createPoolAllocator`        | One block at a time, in any order         |

A storage from `allocate` refuses every `get` and `set` once its allocator
released its memory, rather than read values that are no longer its own. Bytes
asked for directly with `allocator.allocate` are not guarded: check
`allocation.isLive()` before reading them.

## `View<T>`, `Pointer<T>` and `MemoryReference<T>`

Reach into values held somewhere else without copying them or owning them:

```ts
const scores = createManagedStorage(100, 0);
const firstTen: View<number> = asView(scores, 0, 10);

firstTen.set(3, 42); // writes scores[3]
average(firstTen.readOnly()); // no `set`, in its type or at runtime

const cursor: Pointer<number> = pointerTo(scores, 0).offset(5);
const hits: MemoryReference<number> = referenceTo(0);
```

| Function                                  | Returns                                                 |
| ----------------------------------------- | ------------------------------------------------------- |
| `asView(source, start?, length?)`         | A region of a storage, a view or an array, read & write |
| `asReadOnlyView(source, start?, length?)` | The same region, read only                              |
| `pointerTo(source, index)`                | One position, which `offset` moves                      |
| `referenceTo(value)`                      | One value that can be read and replaced                 |

Making a view, or a subview of one, reads nothing however long it is. A view
over a storage from `allocate` refuses once the memory is released, as the
storage does.

---

**Full guide:** [docs/memory.md](../../docs/memory.md) — choosing a strategy,
what each one costs, and the failure modes worth knowing before you meet them.
