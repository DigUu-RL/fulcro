import { ArrayOfStructures } from '@/src/arrayOfStructures';
import {
	createLaidOutStorage,
	type DataLayout,
	type LayoutStrategy,
	strategyOf,
} from '@/src/dataLayout';
import { type FixedLayoutElement, requireElement } from '@/src/element';
import { type FieldBytes, fieldBytesOf } from '@/src/element/fieldBytes';
import type { Storage } from '@/src/storage';
import { requireLength } from '@/src/storage/requireLength';

/**
 * Creates a storage held in one buffer of fixed size: every value stored as
 * its bytes, behind the {@link Storage} contract.
 *
 * ```ts
 * const SensorContact = struct('SensorContact', {
 * 	bearing: SinglePrecisionFloat,
 * 	range: SinglePrecisionFloat,
 * });
 *
 * const contacts: Storage<Struct<typeof SensorContact>> = createFixedBufferStorage(
 * 	SensorContact,
 * 	1_000,
 * );
 *
 * contacts.set(0, SensorContact.from({ bearing: 90, range: 1_200 }));
 * contacts.get(0).bearing; // 90
 * ```
 *
 * The buffer is allocated once and starts zeroed, so every position reads as
 * the element type's zero value until it is set. Nothing is made at creation:
 * a value is materialised when it is read, a new one on every `get`, and
 * holding a million of them costs the bytes and not a million objects.
 *
 * The layout says how the bytes are arranged: `ArrayOfStructures`, each value
 * end to end, `length × element.layout.size` bytes; or `StructureOfArrays`,
 * each field in a column of its own. The values a storage takes and gives are
 * the same in both, and so are its checks and its errors.
 *
 * `set` refuses a value the element type does not recognise as its own, before
 * a byte is written.
 *
 * @param element Type of the values: a struct, or anything with its shape.
 * @param length How many values it holds, fixed from now on.
 * @param layout How the bytes are arranged; `ArrayOfStructures` when omitted.
 * @returns The storage, frozen.
 * @throws {TypeError} When the element type lacks a name, a layout size, or
 * `read`, `write` or `is`, when its fields overlap, or when the layout is not
 * `ArrayOfStructures` or `StructureOfArrays`.
 * @throws {RangeError} When the length is not a non-negative safe integer.
 */
export const createFixedBufferStorage = <T>(
	element: FixedLayoutElement<T>,
	length: number,
	layout: DataLayout = ArrayOfStructures,
): Storage<T> => {
	requireElement('createFixedBufferStorage', element);
	requireLength('createFixedBufferStorage', length);

	const strategy: LayoutStrategy = strategyOf('createFixedBufferStorage', layout);

	const fields: readonly FieldBytes[] | undefined = fieldBytesOf(
		'createFixedBufferStorage',
		element,
	);

	const view = new DataView(new ArrayBuffer(strategy.byteLength(element, fields, length)));

	return createLaidOutStorage(
		strategy,
		element,
		{ element, fields, length, view, layout, allocation: undefined },
		{ get: 'FixedBufferStorage.get', set: 'FixedBufferStorage.set' },
	);
};
