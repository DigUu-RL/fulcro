import { createManagedAllocator } from '@fulcro/memory';

/**
 * A managed allocator made in another module, so that the escape analysis is
 * seen following an imported name back to where the allocator was made.
 */
export const shared = createManagedAllocator();
