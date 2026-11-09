import type { Allocation } from '@/src/allocator';
import { createByteStorage } from '@/src/byteStorage';
import { createCheckedStorage, type OperationNames } from '@/src/byteStorage/checkedStorage';
import { type DataLayout, defineDataLayout } from '@/src/dataLayout';
import type { FixedLayoutElement } from '@/src/element';
import type { FieldBytes } from '@/src/element/fieldBytes';
import type { Storage } from '@/src/storage';

/** One field's column: where its bytes are in the value, and in the storage. */
interface Column {
	/** Where the field sits in the bytes of one value. */
	readonly offset: number;

	/** How many bytes the field occupies. */
	readonly size: number;

	/** Where the column holding that field of every value starts. */
	readonly start: number;
}

/**
 * Builds the storage of a type with fields, each field held in a column of
 * its own.
 *
 * A whole value is still read and written by the element type, over the bytes
 * of one value: `get` gathers the field's bytes from each column into them
 * and reads the value from there, and `set` writes the value there and
 * scatters its bytes back. So a value comes out exactly as it does from an
 * array of structures — the same type, the same methods, the same `NaN`
 * pattern — and the element type is asked for nothing it would not be asked
 * for in one.
 *
 * @param element Type of the values, already checked.
 * @param fields Its fields, by offset.
 * @param length How many values it holds, already checked.
 * @param view The bytes, one column per field.
 * @param names How `get` and `set` are named in an error message.
 * @param allocation Where the bytes came from, when an allocator lent them.
 * @returns The storage, frozen.
 */
const createColumnStorage = <T>(
	element: FixedLayoutElement<T>,
	fields: readonly FieldBytes[],
	length: number,
	view: DataView,
	names: OperationNames,
	allocation?: Allocation,
): Storage<T> => {
	// Each field's column starts where the fields before it end, once for every
	// value: `length × offset`. That is aligned whenever the offset is, and two
	// columns never meet, since no field starts before the one before it ends.
	const columns: readonly Column[] = fields.map((field) => {
		return { offset: field.offset, size: field.size, start: length * field.offset };
	});

	// The bytes of one value, made once: reading one makes no buffer, only the
	// value itself, as an array of structures does.
	const scratch = new DataView(new ArrayBuffer(element.layout.size));

	// The bytes are copied through the `DataView`s rather than through arrays
	// over the same buffers: an array over a buffer that shrank or was detached
	// reads `undefined` and would copy it as zero, where a `DataView` throws —
	// exactly what an array of structures throws over the same buffer.

	return createCheckedStorage(
		element,
		length,
		names,
		{
			read: (index: number): T => {
				for (const column of columns) {
					const from: number = column.start + index * column.size;

					for (let byte = 0; byte < column.size; byte++) {
						scratch.setUint8(column.offset + byte, view.getUint8(from + byte));
					}
				}

				return element.read(scratch, 0);
			},

			write: (index: number, value: T): void => {
				element.write(scratch, 0, value);

				for (const column of columns) {
					const to: number = column.start + index * column.size;

					for (let byte = 0; byte < column.size; byte++) {
						view.setUint8(to + byte, scratch.getUint8(column.offset + byte));
					}
				}
			},
		},
		allocation,
	);
};

/**
 * Lays the values of a storage out one field at a time, each field's bytes
 * together: the first field of every value, then the second field of every
 * value, and so on.
 *
 * ```ts
 * const fleet = createFixedBufferStorage(Starfighter, 10_000, StructureOfArrays);
 * const hulls = asFieldView(fleet, 'hull'); // one column, end to end
 * ```
 *
 * Built for walking one field of many values: through `asFieldView`, that
 * field's bytes are one run, and nothing else is read on the way. Reading a
 * whole value, on the other hand, gathers it from every column — see
 * `ArrayOfStructures` for the layout built for that.
 *
 * Code written against `Storage<T>` does not change: `get` and `set` take and
 * give the same values, with the same checks and the same errors, in either
 * layout. A field that is a struct itself is one column, of whole nested
 * values. A type with no fields, such as a numeric type, has one column of
 * its own, which is an array of structures by another name.
 *
 * The columns hold no tail padding: `length` values take `length` times the
 * bytes up to the end of the last field — for a struct, the sum of its
 * fields' sizes — never more than in an array of structures.
 */
export const StructureOfArrays: DataLayout = defineDataLayout('StructureOfArrays', {
	byteLength: (element, fields, length) => {
		const last: FieldBytes | undefined = fields?.at(-1);

		return length * (last === undefined ? element.layout.size : last.offset + last.size);
	},

	createStorage: (element, fields, length, view, names, allocation) => {
		if (fields === undefined) return createByteStorage(element, length, view, names, allocation);

		return createColumnStorage(element, fields, length, view, names, allocation);
	},

	fieldPlacement: (_element, field, length) => {
		return { start: length * field.offset, stride: field.size };
	},
});
