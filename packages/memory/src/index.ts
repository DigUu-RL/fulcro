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
export { allocate } from '@/allocate';
export type { Allocation, AllocationDomain, Allocator } from '@/allocator';
export { type ArenaAllocator, createArenaAllocator } from '@/arenaAllocator';
export {
	createFixedBufferAllocator,
	type FixedBufferAllocator,
} from '@/fixedBufferAllocator';
export { createFixedBufferStorage } from '@/fixedBufferStorage';
export { createManagedAllocator } from '@/managedAllocator';
export { createManagedStorage } from '@/managedStorage';
export { createPoolAllocator, type PoolAllocator } from '@/poolAllocator';
export { createStackAllocator, type StackAllocator } from '@/stackAllocator';
export type { Storage } from '@/storage';
