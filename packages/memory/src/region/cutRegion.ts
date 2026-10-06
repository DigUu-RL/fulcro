import { requirePart } from '@/region/requirePart';
import type { Source } from '@/source';
import { resolveSource } from '@/source/resolveSource';

/** A region of a source, checked: what a view is built from. */
export interface Region<T> {
	readonly source: Source<T>;
	readonly start: number;
	readonly length: number;
}

/**
 * Finds the region `asView` or `asReadOnlyView` was asked for.
 *
 * The arguments after the source mean different things by source, and this
 * is the one place that reads them: over a storage, a view or an array they
 * are a start and a length; over a pointer, a length from where it points;
 * over a reference there are none, and the region is its one value.
 *
 * @param operation Operation being performed, for an error message.
 * @param value Value handed in as the source.
 * @param access Whether the view will write as well as read.
 * @param first The start, or the length after a pointer.
 * @param second The length after a start.
 * @returns The region, checked against the source.
 * @throws {TypeError} When the value is not a source of that access.
 * @throws {RangeError} When the region does not fit inside it.
 */
export const cutRegion = <T>(
	operation: string,
	value: unknown,
	access: 'read' | 'write',
	first: number | undefined,
	second: number | undefined,
): Region<T> => {
	const { source, start, single } = resolveSource<T>(operation, value, access);
	const available: number = source.length();

	if (single) {
		const length: number = first ?? 1;

		requirePart(operation, start, length, available);

		return { source, start, length };
	}

	const from: number = first ?? 0;

	return {
		source,
		start: from,
		length: requirePart(operation, from, second, available),
	};
};
