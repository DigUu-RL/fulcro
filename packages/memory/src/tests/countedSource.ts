import type { Storage } from '@/storage';

/** How often a counted source was read and written. */
export interface SourceCounts {
	reads: number;
	writes: number;
}

/**
 * A storage of `length` numbers holding `0, 1, 2, …`, counting every `get`
 * and `set` made to it — a storage written outside the package, as far as
 * the access layer can tell.
 *
 * @param length How many values.
 * @returns The storage, and the counts it updates.
 */
export const countedStorage = (
	length: number,
): { storage: Storage<number>; counts: SourceCounts } => {
	const counts: SourceCounts = { reads: 0, writes: 0 };
	const values: number[] = Array.from({ length }, (_, index) => index);

	return {
		counts,
		storage: {
			length,
			get: (index: number): number => {
				counts.reads++;

				return values[index] as number;
			},
			set: (index: number, value: number): void => {
				counts.writes++;
				values[index] = value;
			},
		},
	};
};

/**
 * An array of `length` numbers holding `0, 1, 2, …`, counting every element
 * read from it and written to it; reading its length is not counted.
 *
 * @param length How many values.
 * @returns The array, behind a counting proxy, and the counts it updates.
 */
export const countedArray = (
	length: number,
): { array: number[]; counts: SourceCounts } => {
	const counts: SourceCounts = { reads: 0, writes: 0 };
	const isElement = (key: string | symbol): boolean =>
		typeof key === 'string' && /^\d+$/.test(key);

	return {
		counts,
		array: new Proxy(
			Array.from({ length }, (_, index) => index),
			{
				get: (target, key, receiver) => {
					if (isElement(key)) counts.reads++;

					return Reflect.get(target, key, receiver);
				},
				set: (target, key, value, receiver) => {
					if (isElement(key)) counts.writes++;

					return Reflect.set(target, key, value, receiver);
				},
			},
		),
	};
};
