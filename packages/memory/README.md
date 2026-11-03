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
const totalCredits = <T extends number>(bounties: Storage<T>): number => {
	let sum = 0;

	for (let index = 0; index < bounties.length; index++) sum += bounties.get(index);

	return sum;
};
```

| Strategy                   | Holds                                                                       |
| -------------------------- | --------------------------------------------------------------------------- |
| `createManagedStorage`     | Any value, as it is, in an ordinary array                                   |
| `createFixedBufferStorage` | Values of a struct or of a numeric type, as bytes, end to end in one buffer |

```ts
const bounties = createManagedStorage(3, 0);

const contacts = createFixedBufferStorage(SensorContact, 1_000_000); // 8 MB, no objects
contacts.set(0, SensorContact.from({ bearing: 90, range: 1_200 }));
```

The structs themselves — and the numeric types their fields are made of — are
[`@fulcro/types`](../types/README.md).

The Bounty Hunters' Guild totting up its board, and the Executor's sensors
holding a million contacts as bytes — the same summing code reading both:

```ts
import { createFixedBufferStorage, createManagedStorage, type Storage } from '@fulcro/memory';
import { SinglePrecisionFloat, struct } from '@fulcro/types';

const totalCredits = <T extends number>(bounties: Storage<T>): number => {
	let sum = 0;

	for (let index = 0; index < bounties.length; index++) sum += bounties.get(index);

	return sum;
};

const bounties = createManagedStorage(3, 0);

bounties.set(0, 50_000); // Han Solo
bounties.set(1, 25_000); // Chewbacca
bounties.set(2, 15_000); // Lando Calrissian

console.log(totalCredits(bounties)); // 90000

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});

const contacts = createFixedBufferStorage(SensorContact, 1_000_000);

contacts.set(0, SensorContact.from({ bearing: 90, range: 1_200 }));
contacts.set(1, SensorContact.from({ bearing: 270, range: 300 }));

const ranges = createFixedBufferStorage(SinglePrecisionFloat, 2);

ranges.set(0, contacts.get(0).range);
ranges.set(1, contacts.get(1).range);

console.log(contacts.length, SensorContact.layout.size); // 1000000 8
console.log(totalCredits(ranges)); // 1500 — a fixed buffer, read by the same code
```

## `Allocator`

Where the memory comes from is chosen at the call site. `allocate` returns a
`Storage<T>` from whichever allocator you pass:

```ts
const step = (stack: StackAllocator): void => {
	using frame = stack.enter();
	const bolts = allocate(BlasterBolt, 10_000, frame);
	// …
}; // released here, all at once
```

| Allocator                    | Memory goes back                          |
| ---------------------------- | ----------------------------------------- |
| `createManagedAllocator`     | By the garbage collector, or with a frame |
| `createArenaAllocator`       | All at once, on `reset()` or with `using` |
| `createStackAllocator`       | A frame at a time, last in first out      |
| `createFixedBufferAllocator` | All at once, on `reset()` or with `using` |
| `createPoolAllocator`        | One block at a time, or with `using`      |

A storage from `allocate` refuses every `get` and `set` once its allocator
released its memory, rather than read values that are no longer its own. Bytes
asked for directly with `allocator.allocate` are not guarded: check
`allocation.isLive()` before reading them.

A blaster training simulation stepping through its frames, each frame's bolts
released at once when the frame ends:

```ts
import { allocate, createStackAllocator, type StackAllocator, type Storage } from '@fulcro/memory';
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const BlasterBolt = struct('BlasterBolt', {
	heat: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type BlasterBolt = Struct<typeof BlasterBolt>;

const step = (stack: StackAllocator, firing: number): number => {
	using frame = stack.enter();
	const bolts: Storage<BlasterBolt> = allocate(BlasterBolt, 10_000, frame);

	for (let bolt = 0; bolt < firing; bolt++)
		bolts.set(bolt, BlasterBolt.from({ heat: 1, speed: 0.5 }));

	let heat = 0;

	for (let bolt = 0; bolt < bolts.length; bolt++) heat += bolts.get(bolt).heat;

	return heat;
}; // every bolt is released here, at once

// One buffer, reused by every frame: room for exactly one frame of bolts.
const stack = createStackAllocator(10_000 * BlasterBolt.layout.size);

console.log(step(stack, 3)); // 3
console.log(step(stack, 5)); // 5 — the same bytes, zeroed again for the next frame
```

## `View<T>`, `Pointer<T>` and `MemoryReference<T>`

Reach into values held somewhere else without copying them or owning them:

```ts
const shieldStrength = createManagedStorage(100, 0);
const firstTen: View<number> = asView(shieldStrength, 0, 10);

firstTen.set(3, 42); // writes shieldStrength[3]
average(firstTen.readOnly()); // no `set`, in its type or at runtime

const cursor: Pointer<number> = pointerTo(shieldStrength, 0).offset(5);
const kills: MemoryReference<number> = referenceTo(0);
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

The Death Star's shield grid, its northern sector handed to a technician as a
view, a cursor walking its generators, and Han's kill counter beside it:

```ts
import {
	asView,
	createManagedStorage,
	type MemoryReference,
	pointerTo,
	type ReadOnlyView,
	referenceTo,
	type View,
} from '@fulcro/memory';

const average = (sector: ReadOnlyView<number>): number => {
	let sum = 0;

	for (let index = 0; index < sector.length; index++) sum += sector.get(index);

	return sum / sector.length;
};

const shieldStrength = createManagedStorage(100, 0);
const northernSector: View<number> = asView(shieldStrength, 0, 10);

northernSector.set(3, 42);

console.log(shieldStrength.get(3)); // 42 — the view wrote the storage, nothing copied
console.log(average(northernSector.readOnly())); // 4.2

const cursor = pointerTo(shieldStrength, 0).offset(3);

console.log(cursor.index, cursor.get()); // 3 42

const recordKill = (counter: MemoryReference<number>): void => {
	counter.set(counter.get() + 1);
};

const hansKills = referenceTo(0);

recordKill(hansKills);
recordKill(cursor); // a pointer is a reference too

console.log(hansKills.get(), shieldStrength.get(3)); // 1 43
```

## `LinearMemory` and `NativePointer<T>`

Reach values by byte address — a field in the middle of a struct, the same
bytes read as another type, what a WebAssembly module wrote — with no copy:

```ts
const memory: LinearMemory = createLinearMemory(instance.exports.memory as WebAssembly.Memory);
const xWing: NativePointer<Starfighter> = nativePointerTo(memory, 64, Starfighter);

xWing
	.at(Starfighter.layout.fields.thrust.offset, Thrust)
	.set(Thrust.from({ forward: 0, lateral: -9.8 })); // writes the field, in place
```

| Function                                    | Returns                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `createLinearMemory(backing)`               | An address space over an `ArrayBuffer` or a `WebAssembly.Memory` |
| `nativePointerTo(memory, address, element)` | A pointer anywhere in that memory                                |
| `nativePointerTo(allocation, element)`      | A pointer bounded to an allocation, refused once released        |

A native pointer reads the current bytes on every access, so it keeps working
after the memory grows. Shared memory and misaligned addresses are refused.

An X-wing's flight computer, its thrust reached in place inside the
starfighter's bytes, and the same bytes read back as plain floats:

```ts
import { createLinearMemory, nativePointerTo } from '@fulcro/memory';
import { SinglePrecisionFloat, struct } from '@fulcro/types';

const Thrust = struct('Thrust', { forward: SinglePrecisionFloat, lateral: SinglePrecisionFloat });
const Starfighter = struct('Starfighter', { shields: SinglePrecisionFloat, thrust: Thrust });

const backing = new ArrayBuffer(256);
const memory = createLinearMemory(backing);

const xWing = nativePointerTo(memory, 64, Starfighter);
const thrust = xWing.at(Starfighter.layout.fields.thrust.offset, Thrust);

thrust.set(Thrust.from({ forward: 0, lateral: -9.75 }));

console.log(xWing.get().thrust.lateral); // -9.75 — written through a pointer to the one field
console.log(thrust.address - xWing.address); // 4 — the field's offset, in bytes
console.log(new Float32Array(backing, 72, 1)[0]); // -9.75 — the very bytes, read as a float

try {
	nativePointerTo(memory, 66, Starfighter);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7020')); // true — not aligned for the type
}
```

## `Owned<T>`, `Borrowed<T>` and `MutableBorrow<T>`

Say who may use values, and for how long. A storage gets one owner; its values
are lent to any number of readers at once or to one writer alone, and a move
hands them on and spends the old owner:

```ts
const launchQueue: Owned<number> = own(() => createManagedStorage(64, 0));

borrowMutable(launchQueue).set(0, 5);

const hangarCrew = move(launchQueue);

borrow(hangarCrew).get(0); // 5
borrow(launchQueue); // throws FULCRO7023: launchQueue was moved
```

| Function               | Returns                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `own(create)`          | The owner of the storage `create` makes                       |
| `borrow(owner)`        | A `ReadOnlyView<T>` that ends when the owner is lent to write |
| `borrowMutable(owner)` | A `View<T>` that ends when the owner is lent again            |
| `move(owner)`          | A new owner of the same values; the old one is spent          |

A borrow that has ended throws on its next access, and so does anything made
from it. Declared with `using`, an owner ends with its scope — every borrow of
it ends there — unless it was moved out first. The optional transformer —
`@fulcro/memory/transformer` for `ts-patch`, `@fulcro/memory/unplugin` for a
bundler — refuses the same uses when the code is compiled. It rewrites no call;
what it does rewrite is a storage allocated from a managed allocator that
cannot outlive its block, which it allocates from a frame of that allocator
(`using frame = managed.enter()`), so the next run of the block reuses its
bytes.

The launch queue handed from the flight controller to the hangar crew — and the
controller's console, which still held the old owner. The transformer refuses
`borrow(launchQueue)` after the move when it compiles, so the runtime refusal is
shown through an owner held in a property, which it does not follow:

```ts
import { borrow, borrowMutable, createManagedStorage, move, own } from '@fulcro/memory';

const flightControl = { queue: own(() => createManagedStorage(64, 0)) };

borrowMutable(flightControl.queue).set(0, 5);

const hangarCrew = move(flightControl.queue);

console.log(borrow(hangarCrew).get(0)); // 5 — the same values, nothing copied

try {
	borrow(flightControl.queue);
} catch (error) {
	console.log((error as Error).message.startsWith('FULCRO7023')); // true — moved, and refused
}
```

---

**Full guide:** [docs/memory.md](../../docs/memory.md) — choosing a strategy,
what each one costs, and the failure modes worth knowing before you meet them.
🇧🇷 [Leia em português](../../docs/pt-BR/memory.md).
