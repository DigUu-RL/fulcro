import { createByteStorage } from '@/src/byteStorage';
import { type DataLayout, defineDataLayout } from '@/src/dataLayout';

/**
 * Lays the values of a storage out one after the other, each value's bytes
 * together: the first value's fields, then the second's, and so on.
 *
 * ```ts
 * const squadron = createFixedBufferStorage(Starfighter, 12, ArrayOfStructures);
 * ```
 *
 * The layout every storage held as bytes has when none is named, and the one
 * that reads a whole value cheapest: its bytes are one run, read in one call.
 * Walking one field of every value, on the other hand, reaches past the other
 * fields at every step — see `StructureOfArrays` for the layout built for
 * that.
 *
 * Each value occupies `element.layout.size` bytes, its padding included, so
 * the next one starts aligned.
 */
export const ArrayOfStructures: DataLayout = defineDataLayout('ArrayOfStructures', {
	byteLength: (element, _fields, length) => length * element.layout.size,

	createStorage: (element, _fields, length, view, names, allocation) => {
		return createByteStorage(element, length, view, names, allocation);
	},

	fieldPlacement: (element, field) => ({ start: field.offset, stride: element.layout.size }),
});
