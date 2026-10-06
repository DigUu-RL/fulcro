import { requirePart } from '@/region/requirePart';
import type { Source } from '@/source';
import { requireIndex } from '@/storage/requireIndex';
import type { ReadOnlyView, View } from '@/view';

/**
 * Builds a read-only view of `length` values of a source, from `start`.
 *
 * The one implementation behind `asReadOnlyView` and `View.readOnly`. The
 * object has no `set`, so the region cannot be written through it whatever it
 * is cast to.
 *
 * @param source What the values are read from.
 * @param start Where the region begins in the source, already checked.
 * @param length How many values it observes, already checked.
 * @returns The view, frozen.
 */
export const createReadOnlyView = <T>(
	source: Source<T>,
	start: number,
	length: number,
): ReadOnlyView<T> =>
	Object.freeze({
		length,

		get: (index: number): T => {
			requireIndex('ReadOnlyView.get', index, length);

			return source.read('ReadOnlyView.get', start + index);
		},

		// A subview is cut from the source, not from this view: a hundred
		// nested subviews read through one indirection, not a hundred.
		subview: (from: number, count?: number): ReadOnlyView<T> =>
			createReadOnlyView(
				source,
				start + from,
				requirePart('ReadOnlyView.subview', from, count, length),
			),
	});

/**
 * Builds a view of `length` values of a source, from `start`.
 *
 * The one implementation behind `asView`, and behind every subview of a view.
 *
 * @param source What the values are read from and written to.
 * @param start Where the region begins in the source, already checked.
 * @param length How many values it observes, already checked.
 * @returns The view, frozen.
 */
export const createView = <T>(
	source: Source<T>,
	start: number,
	length: number,
): View<T> =>
	Object.freeze({
		length,

		get: (index: number): T => {
			requireIndex('View.get', index, length);

			return source.read('View.get', start + index);
		},

		set: (index: number, value: T): void => {
			requireIndex('View.set', index, length);
			source.write('View.set', start + index, value);
		},

		subview: (from: number, count?: number): View<T> =>
			createView(
				source,
				start + from,
				requirePart('View.subview', from, count, length),
			),

		readOnly: (): ReadOnlyView<T> => createReadOnlyView(source, start, length),
	});
