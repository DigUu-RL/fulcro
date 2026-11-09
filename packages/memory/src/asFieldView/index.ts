import { createError } from '@fulcro/errors';

import { createByteStorage } from '@/src/byteStorage';
import { type StoredLayout, storedLayoutOf, strategyOf } from '@/src/dataLayout';
import { type FixedLayoutElement, requireElement } from '@/src/element';
import type { FieldBytes } from '@/src/element/fieldBytes';
import { createView } from '@/src/region';
import { storageSource } from '@/src/source';
import type { Storage } from '@/src/storage';
import type { View } from '@/src/view';

/**
 * The fields a value's type declares in its layout: for a struct of
 * `@fulcro/types`, exactly its fields, and never its methods or `'~layout'`.
 *
 * @template T Type of the values a storage holds.
 */
type FieldKey<T> = T extends { readonly '~layout': { readonly fields: infer TFields } }
	? Extract<keyof TFields, keyof T> & string
	: never;

/**
 * The type of each field, by name, that a struct of `@fulcro/types` carries
 * as `fields`.
 *
 * @param stored What the storage was made from.
 * @returns The field types, or `undefined` when the element names none.
 */
const fieldTypesOf = (stored: StoredLayout): Readonly<Record<string, unknown>> | undefined => {
	const declared: unknown = (stored.element as { readonly fields?: unknown }).fields;

	return typeof declared === 'object' && declared !== null && stored.fields !== undefined
		? (declared as Readonly<Record<string, unknown>>)
		: undefined;
};

/**
 * Observes one field of every value of a storage, as a view of that field's
 * values, copying nothing.
 *
 * ```ts
 * const fleet = createFixedBufferStorage(Starfighter, 10_000, StructureOfArrays);
 * const hulls: View<number> = asFieldView(fleet, 'hull');
 *
 * hulls.set(0, SinglePrecisionFloat.from(0.5)); // fleet.get(0).hull is now 0.5
 * ```
 *
 * Nothing is read when the view is made. Every `get` and `set` reads or writes
 * that field's bytes in the storage and no other: neither the other fields nor
 * a whole value is touched, so the view and the storage always agree.
 *
 * It works the same over either layout, and what it costs is what tells them
 * apart. In a `StructureOfArrays` the field's bytes are one column, end to
 * end, and a numeric field whose encoding has a typed array is held in one. In
 * an `ArrayOfStructures` every step reaches past the other fields of the
 * value.
 *
 * The source is a storage made by `createFixedBufferStorage` or `allocate`, of
 * a type that declares its fields — a struct. A view of it, or any other
 * storage, holds no bytes this function can find, and is refused.
 *
 * @template T Type of the values the storage holds.
 * @template TKey Name of the field.
 * @param source The storage.
 * @param key Name of the field, one the struct declares.
 * @returns The view of that field, frozen; a `View<T>`, with `subview` and
 * `readOnly`.
 * @throws {TypeError} When the source holds no bytes this package laid out,
 * when its type declares no fields, or when it declares none of that name.
 */
export const asFieldView = <T, TKey extends string>(
	source: Storage<T>,
	// The key is inferred on its own and checked against the fields after: a
	// constraint naming `T` would be read before `T` is known, and widen every
	// key to the union of the fields.
	key: TKey & FieldKey<T>,
): View<T[TKey & FieldKey<T>]> => {
	const stored: StoredLayout | undefined = storedLayoutOf(source);

	if (stored === undefined) {
		throw createError('FULCRO7033', { operation: 'asFieldView' });
	}

	const fieldTypes: Readonly<Record<string, unknown>> | undefined = fieldTypesOf(stored);

	if (fieldTypes === undefined || stored.fields === undefined) {
		throw createError('FULCRO7035', { operation: 'asFieldView', element: stored.element.name });
	}

	// Read as what a JavaScript caller can actually pass, which the type rules out.
	const name: unknown = key;
	const field: FieldBytes | undefined = stored.fields.find((candidate) => candidate.key === name);

	if (field === undefined || !Object.hasOwn(fieldTypes, field.key)) {
		throw createError('FULCRO7034', {
			operation: 'asFieldView',
			element: stored.element.name,
			field: String(name),
			// In the order the struct declared them, which is how its author
			// knows them, rather than the order they were placed in.
			fields: Object.keys(fieldTypes).join(', '),
		});
	}

	const fieldType: unknown = fieldTypes[field.key];

	requireElement('asFieldView', fieldType);

	const element = fieldType as FixedLayoutElement<T[TKey & FieldKey<T>]>;

	// A field type whose values take more room than the layout gives the field
	// would write over its neighbour; the layout is what the bytes were laid
	// out by, so it is the one trusted.
	if (element.layout.size !== field.size) {
		throw createError('FULCRO7032', {
			operation: 'asFieldView',
			element: stored.element.name,
			field: field.key,
		});
	}

	const values: Storage<T[TKey & FieldKey<T>]> = createByteStorage(
		element,
		stored.length,
		stored.view,
		{ get: 'View.get', set: 'View.set' },
		stored.allocation,
		strategyOf('asFieldView', stored.layout).fieldPlacement(stored.element, field, stored.length),
	);

	return createView(storageSource(values), 0, stored.length);
};
