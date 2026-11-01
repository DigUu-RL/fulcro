/**
 * Public entry point of the package, matching the `main` and `types` fields of
 * `package.json`.
 *
 * The package owns where a value's bytes live and who may reach them: the
 * storage that holds them, the allocator that hands out room for them, and the
 * pointers and views that reach into them. The values themselves and their
 * byte layout belong to `@fulcro/types`.
 *
 * It never imports `@fulcro/reflect`. A layout is read from the descriptor
 * `@fulcro/types` builds, because `layoutOf<T>()` has no answer without its
 * transformer, and because a later reflect feature may come to depend on this
 * package — the edge in the other direction would close a cycle.
 *
 * Listed one by one rather than re-exported wholesale, so that adding an export
 * to a module below is never enough on its own to put it in front of consumers.
 */
export { allocate } from '@/src/allocate';
export type { Allocation, AllocationDomain, Allocator } from '@/src/allocator';
export { type ArenaAllocator, createArenaAllocator } from '@/src/arenaAllocator';
export { asReadOnlyView } from '@/src/asReadOnlyView';
export { asView } from '@/src/asView';
export { borrow } from '@/src/borrow';
export type { Borrowed } from '@/src/borrowed';
export { borrowMutable } from '@/src/borrowMutable';
export { createFixedBufferAllocator, type FixedBufferAllocator } from '@/src/fixedBufferAllocator';
export { createFixedBufferStorage } from '@/src/fixedBufferStorage';
export { createLinearMemory, type LinearMemory } from '@/src/linearMemory';
export { createManagedAllocator, type ManagedAllocator } from '@/src/managedAllocator';
export { createManagedStorage } from '@/src/managedStorage';
export type { MemoryReference } from '@/src/memoryReference';
export { move } from '@/src/move';
export type { MutableBorrow } from '@/src/mutableBorrow';
export type { NativePointer } from '@/src/nativePointer';
export { nativePointerTo } from '@/src/nativePointerTo';
export { own } from '@/src/own';
export type { Owned } from '@/src/owned';
export type { Pointer } from '@/src/pointer';
export { pointerTo } from '@/src/pointerTo';
export { createPoolAllocator, type PoolAllocator } from '@/src/poolAllocator';
export { referenceTo } from '@/src/referenceTo';
export { createStackAllocator, type StackAllocator } from '@/src/stackAllocator';
export type { Storage } from '@/src/storage';
export type { ReadOnlyView, View } from '@/src/view';
