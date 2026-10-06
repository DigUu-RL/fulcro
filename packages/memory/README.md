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
	borrow,
	borrowMutable,
	createFixedBufferStorage,
	createLinearMemory,
	createManagedStorage,
	createStackAllocator,
	move,
	nativePointerTo,
	own,
	pointerTo,
	referenceTo,
	type LinearMemory,
	type MemoryReference,
	type NativePointer,
	type Owned,
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

## `LinearMemory` and `NativePointer<T>`

Reach values by byte address — a field in the middle of a struct, the same
bytes read as another type, what a WebAssembly module wrote — with no copy:

```ts
const memory: LinearMemory = createLinearMemory(
	instance.exports.memory as WebAssembly.Memory,
);
const particle: NativePointer<Particle> = nativePointerTo(memory, 64, Particle);

particle
	.at(Particle.layout.fields.velocity.offset, Point)
	.set(Point.from({ x: 0, y: -9.8 })); // writes the field, in place
```

| Function                                    | Returns                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `createLinearMemory(backing)`               | An address space over an `ArrayBuffer` or a `WebAssembly.Memory` |
| `nativePointerTo(memory, address, element)` | A pointer anywhere in that memory                                |
| `nativePointerTo(allocation, element)`      | A pointer bounded to an allocation, refused once released        |

A native pointer reads the current bytes on every access, so it keeps working
after the memory grows. Shared memory and misaligned addresses are refused.

## `Owned<T>`, `Borrowed<T>` and `MutableBorrow<T>`

Say who may use values, and for how long. A storage gets one owner; its values
are lent to any number of readers at once or to one writer alone, and a move
hands them on and spends the old owner:

```ts
const queue: Owned<number> = own(() => createManagedStorage(64, 0));

borrowMutable(queue).set(0, 7);

const worker = move(queue);

borrow(worker).get(0); // 7
borrow(queue); // throws FULCRO7023: queue was moved
```

| Function               | Returns                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `own(create)`          | The owner of the storage `create` makes                       |
| `borrow(owner)`        | A `ReadOnlyView<T>` that ends when the owner is lent to write |
| `borrowMutable(owner)` | A `View<T>` that ends when the owner is lent again            |
| `move(owner)`          | A new owner of the same values; the old one is spent          |

A borrow that has ended throws on its next access, and so does anything made
from it. The optional transformer — `@fulcro/memory/transformer` for
`ts-patch`, `@fulcro/memory/unplugin` for a bundler — refuses the same uses when
the code is compiled. It rewrites nothing.

---

**Full guide:** [docs/memory.md](../../docs/memory.md) — choosing a strategy,
what each one costs, and the failure modes worth knowing before you meet them.
