import { createError } from '@fulcro/errors';

import type { MemoryReference } from '@/memoryReference';
import {
	arraySource,
	referenceSource,
	type Source,
	storageSource,
} from '@/source';
import { pointerPositions } from '@/source/pointerPositions';
import type { Storage } from '@/storage';

/** What a value handed in as a source turned out to be. */
export interface ResolvedSource<T> {
	readonly source: Source<T>;

	/** Where in the source the value handed in starts. */
	readonly start: number;

	/**
	 * Whether it locates one value — a pointer or a reference — rather than a
	 * region, so that a view over it is one value long unless told otherwise.
	 */
	readonly single: boolean;
}

/** What may be asked of a source. */
type Access = 'read' | 'write';

/** What each kind of access accepts, as it reads in an error message. */
const EXPECTED: Readonly<Record<Access, string>> = {
	read: 'a storage, a view, a read-only view, an array, a pointer or a memory reference',
	write: 'a storage, a view, an array, a pointer or a memory reference',
};

/**
 * Describes a value that is not a source, without its contents.
 *
 * @param value Value handed in.
 * @param access What was going to be asked of it.
 * @returns Its description.
 */
const describeSource = (value: unknown, access: Access): string => {
	if (value === null) return 'null';
	if (typeof value !== 'object') return typeof value;

	const candidate = value as Partial<Record<string, unknown>>;

	if (typeof candidate.get !== 'function') return 'an object without get';

	return access === 'write' ? 'an object with get but no set' : 'an object';
};

/**
 * Tells what a value handed in as a source is, and wraps it as one.
 *
 * Told apart by shape, because a storage written outside this package is as
 * much a source as one made here: an array is an array, something with a
 * numeric `length` and a `get` is a storage or a view, a pointer is one
 * `pointerTo` made, and anything else with a `get` is a reference.
 *
 * @param operation Operation being performed, for the error message.
 * @param value Value handed in as the source.
 * @param access Whether the source will be written as well as read.
 * @returns The source, where the value starts in it, and whether it locates
 * one value.
 * @throws {TypeError} When the value is none of those, or will be written and
 * has no `set`.
 */
export const resolveSource = <T>(
	operation: string,
	value: unknown,
	access: Access,
): ResolvedSource<T> => {
	if (Array.isArray(value)) {
		return { source: arraySource(value as T[]), start: 0, single: false };
	}

	if (typeof value === 'object' && value !== null) {
		const position = pointerPositions.get(value);

		if (position !== undefined) {
			return {
				source: position.source as Source<T>,
				start: position.index,
				single: true,
			};
		}

		const candidate = value as Partial<Record<string, unknown>>;
		const readable = typeof candidate.get === 'function';
		const writableIfNeeded =
			access === 'read' || typeof candidate.set === 'function';

		if (readable && writableIfNeeded) {
			return typeof candidate.length === 'number'
				? {
						source: storageSource(value as Storage<T>),
						start: 0,
						single: false,
					}
				: {
						source: referenceSource(value as MemoryReference<T>),
						start: 0,
						single: true,
					};
		}
	}

	throw createError('FULCRO7017', {
		operation,
		expected: EXPECTED[access],
		received: describeSource(value, access),
	});
};
