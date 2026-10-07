import type { Source } from '@/source';

/** Where a pointer points: its source, and its position in it. */
export interface PointerPosition<T> {
	readonly source: Source<T>;
	readonly index: number;
}

/**
 * The position of every pointer `pointerTo` made, kept beside the pointer
 * rather than on it.
 *
 * `asView(pointer, length)` needs the pointer's source, and a pointer exposes
 * only its index: putting the source on the pointer would make it part of the
 * public shape, and reading the region through `offset(i).get()` would make a
 * pointer per access. Weakly held, so a pointer nobody keeps is collected
 * with its entry.
 */
export const pointerPositions = new WeakMap<object, PointerPosition<unknown>>();
