import { createError } from '@fulcro/errors';

import type { Pointer } from '@/pointer';
import type { Source } from '@/source';
import {
	type PointerPosition,
	pointerPositions,
} from '@/source/pointerPositions';
import { resolveSource } from '@/source/resolveSource';
import type { Storage } from '@/storage';
import { describeValue } from '@/storage/describeValue';
import { requireIndex } from '@/storage/requireIndex';

/**
 * Refuses a position a pointer into `length` values cannot take.
 *
 * @param operation Operation being performed, for the error message.
 * @param index Position asked for.
 * @param length Length of the source now.
 * @throws {RangeError} When the position is not an integer from `0` to
 * `length`.
 */
const requirePosition = (
	operation: string,
	index: unknown,
	length: number,
): void => {
	if (
		typeof index !== 'number' ||
		!Number.isSafeInteger(index) ||
		index < 0 ||
		index > length
	) {
		throw createError('FULCRO7016', {
			operation,
			index: typeof index === 'number' ? index : describeValue(index),
			length,
		});
	}
};

/**
 * Builds a pointer at a position already checked, and records where it
 * points for `asView`.
 *
 * @param source What it points into.
 * @param index Its position.
 * @returns The pointer, frozen.
 */
const createPointer = <T>(source: Source<T>, index: number): Pointer<T> => {
	const pointer: Pointer<T> = Object.freeze({
		index,

		get: (): T => {
			requireIndex('Pointer.get', index, source.length());

			return source.read('Pointer.get', index);
		},

		set: (value: T): void => {
			requireIndex('Pointer.set', index, source.length());
			source.write('Pointer.set', index, value);
		},

		offset: (delta: number): Pointer<T> => {
			const next: unknown = typeof delta === 'number' ? index + delta : delta;

			requirePosition('Pointer.offset', next, source.length());

			return createPointer(source, next as number);
		},
	});

	pointerPositions.set(pointer, { source, index } as PointerPosition<unknown>);

	return pointer;
};

/**
 * Points at one position of a storage, a view or an array.
 *
 * ```ts
 * const queue = createManagedStorage(8, '');
 * const head: Pointer<string> = pointerTo(queue, 0);
 *
 * head.set('first');
 * head.offset(1).set('second');
 * queue.get(1); // 'second'
 * ```
 *
 * The position may be the source's length, one past its last value, so a
 * pointer can step onto the end of a loop; reading or writing there is
 * refused. Reads and writes go to the source, so the pointer and the source
 * always agree.
 *
 * @template T Type of the values.
 * @param source What to point into.
 * @param index Position, from `0` to the source's length.
 * @returns The pointer, frozen.
 * @throws {TypeError} When the source is not a storage, a view or an array.
 * @throws {RangeError} When the position is outside `0` to the source's
 * length.
 */
export const pointerTo = <T>(
	source: Storage<T> | T[],
	index: number,
): Pointer<T> => {
	const resolved = resolveSource<T>('pointerTo', source, 'write');

	if (resolved.single) {
		throw createError('FULCRO7017', {
			operation: 'pointerTo',
			expected: 'a storage, a view or an array',
			received: 'a pointer or a memory reference',
		});
	}

	requirePosition('pointerTo', index, resolved.source.length());

	return createPointer(resolved.source, index);
};
