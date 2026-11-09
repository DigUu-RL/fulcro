import { createError } from '@fulcro/errors';

import type { FixedLayoutElement } from '@/src/element';

/**
 * The part of an element type that says where its bytes are, and nothing about
 * its values: what is read to lay bytes out, whatever type the values have.
 */
export type ElementLayout = Pick<FixedLayoutElement<unknown>, 'name' | 'layout'>;

/** Where one field of a value sits in its bytes. */
export interface FieldBytes {
	/** Name of the field. */
	readonly key: string;

	/** Where its first byte sits, from the first byte of the value. */
	readonly offset: number;

	/** How many bytes it occupies. */
	readonly size: number;
}

/**
 * Tells whether a number counts bytes: a safe integer, and not negative.
 *
 * @param value Value to inspect.
 * @returns `true` when it does.
 */
const isByteCount = (value: unknown): value is number => {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
};

/**
 * The fields an element type's layout places, ordered by where they sit.
 *
 * Read by shape, as `layout.fields` — `{ [key]: { offset, size } }`, which is
 * what every struct of `@fulcro/types` declares — so this package still
 * depends on no type system. A type whose layout places no fields has none,
 * and its values are one undivided run of bytes.
 *
 * The fields are checked before anything is laid out by them: each one inside
 * the value and after the one before it, since a storage holding each field
 * in a column of its own would otherwise write one field over another.
 *
 * @param operation Operation being performed, for the error message.
 * @param element Type of the values, already checked as a
 * {@link FixedLayoutElement}.
 * @returns The fields, by offset, or `undefined` when the layout places none.
 * @throws {TypeError} When a field has no offset or size, overlaps the one
 * before it, or runs past the value's size.
 */
export const fieldBytesOf = (
	operation: string,
	element: ElementLayout,
): readonly FieldBytes[] | undefined => {
	const declared: unknown = (element.layout as { readonly fields?: unknown }).fields;

	if (typeof declared !== 'object' || declared === null) return undefined;

	const fields: FieldBytes[] = Object.entries(declared).map(
		([key, placement]: [string, unknown]) => {
			const { offset, size } = (placement ?? {}) as { offset?: unknown; size?: unknown };

			if (!isByteCount(offset) || !isByteCount(size)) {
				throw createError('FULCRO7032', { operation, element: element.name, field: key });
			}

			return { key, offset, size };
		},
	);

	if (fields.length === 0) return undefined;

	fields.sort((left, right) => left.offset - right.offset);

	let end = 0;

	for (const field of fields) {
		if (field.offset < end || field.offset + field.size > element.layout.size) {
			throw createError('FULCRO7032', { operation, element: element.name, field: field.key });
		}

		end = field.offset + field.size;
	}

	return fields;
};
