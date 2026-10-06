/**
 * Bytes an allocator reserved: where they are, and whether they still belong
 * to whoever asked for them.
 *
 * Releasing is the allocator's business, and usually happens to many
 * allocations at once — an arena reset, a stack frame left — so an allocation
 * cannot stop anyone holding it from reading on. What it can do is say so:
 * `isLive()` turns `false` the moment its bytes are released, and stays false,
 * even after the allocator hands the same bytes to someone else.
 *
 * ```ts
 * const allocation: Allocation = arena.allocate(64, 8);
 *
 * allocation.bytes.setFloat64(0, 1.5);
 * arena.reset();
 * allocation.isLive(); // false — the bytes are the arena's again
 * ```
 */
export interface Allocation {
	/**
	 * The reserved bytes, exactly as many as were asked for, zeroed when they
	 * were handed out.
	 */
	readonly bytes: DataView;

	/**
	 * Tells whether the bytes are still reserved for this allocation.
	 *
	 * @returns `false` once the allocator released them.
	 */
	isLive(): boolean;
}

/**
 * Where memory comes from, chosen by the caller instead of assumed.
 *
 * The contract every allocation strategy honours, and the only thing code that
 * needs memory should depend on: written against `Allocator`, it runs over
 * memory the garbage collector reclaims, an arena, a stack, a fixed buffer or a
 * pool, and over a strategy written later, without changing.
 *
 * ```ts
 * const createSamples = (allocator: Allocator, count: number): DataView =>
 * 	allocator.allocate(count * 8, 8).bytes;
 * ```
 *
 * It promises only to hand memory out. How memory goes back differs by
 * strategy — all at once, last in first out, one block at a time, or never —
 * and each strategy says so with methods of its own, rather than every one
 * carrying a `free` that most of them would have to refuse.
 */
export interface Allocator {
	/**
	 * Reserves bytes.
	 *
	 * @param size How many bytes, a non-negative safe integer.
	 * @param alignment What the first byte's offset must be a multiple of, a
	 * positive power of two.
	 * @returns The allocation.
	 * @throws {RangeError} When the size or the alignment is invalid, or the
	 * allocator has no room left for them.
	 */
	allocate(size: number, alignment: number): Allocation;
}

/**
 * An allocator whose whole region is released when the scope that entered it
 * ends.
 *
 * ```ts
 * {
 * 	using frame = stack.enter();
 * 	const particles = allocate(Particle, 10_000, frame);
 * 	// …
 * } // every allocation made through `frame` is released here, at once
 * ```
 *
 * `using` is TypeScript's own: leaving the block calls `[Symbol.dispose]`,
 * however the block is left. Nothing is released one allocation at a time, so
 * the cost of leaving does not grow with what was allocated.
 */
export interface AllocationDomain extends Allocator, Disposable {}
