/**
 * A run of bytes handed out front to back: everything before `offset` is in
 * use, everything after it is free.
 *
 * The one piece the arena, the stack and the fixed buffer have in common.
 * They differ only in what moves `offset` back — a reset, a frame left — and
 * that part stays with each of them.
 */
export interface BumpRegion {
	/** The bytes. */
	readonly buffer: ArrayBuffer;

	/** Where the next allocation may start. */
	offset: number;
}

/**
 * Reserves the next `size` bytes of a region whose start is a multiple of
 * `alignment`, and zeroes them.
 *
 * Zeroed because the bytes may have been handed out before, and a caller of
 * any strategy should find the same thing in fresh memory: zero, never what
 * an earlier allocation left.
 *
 * @param region Region to reserve from; its offset moves past the bytes.
 * @param size How many bytes.
 * @param alignment Power of two the start must be a multiple of.
 * @returns The bytes, or `undefined` when the region has no room for them,
 * in which case the region is left as it was.
 */
export const bump = (
	region: BumpRegion,
	size: number,
	alignment: number,
): DataView | undefined => {
	const start: number = Math.ceil(region.offset / alignment) * alignment;

	if (start + size > region.buffer.byteLength) return undefined;

	region.offset = start + size;
	new Uint8Array(region.buffer, start, size).fill(0);

	return new DataView(region.buffer, start, size);
};

/**
 * How many bytes of a region are left after its offset.
 *
 * @param region Region to measure.
 * @returns The free byte count, alignment padding not deducted.
 */
export const remaining = (region: BumpRegion): number =>
	region.buffer.byteLength - region.offset;
