import type { GrowableMemory } from '@/linearMemory';

/** A growable memory that counts how often its buffer is asked for. */
export interface CountedMemory {
	/** The memory, to make a linear memory over. */
	readonly backing: GrowableMemory;

	/** How many times `buffer` was read. */
	readonly counts: { reads: number };

	/**
	 * Grows the memory the way a WebAssembly memory does: a new, larger buffer
	 * holding the same bytes, and the old one left behind.
	 *
	 * @param bytes How many bytes to add.
	 */
	grow(bytes: number): void;
}

/**
 * Makes a growable memory of `bytes` bytes whose every `buffer` read is
 * counted — the one cost a pointer pays per access to follow growth.
 *
 * @param bytes Its first size.
 * @returns The memory and its count.
 */
export const countedMemory = (bytes: number): CountedMemory => {
	const counts = { reads: 0 };
	let current = new ArrayBuffer(bytes);

	return {
		backing: {
			get buffer(): ArrayBuffer {
				counts.reads++;

				return current;
			},
		},
		counts,
		grow: (more: number): void => {
			const next = new ArrayBuffer(current.byteLength + more);

			new Uint8Array(next).set(new Uint8Array(current));
			current = next;
		},
	};
};
