import type { ByteCodec } from '@/src/fixedLayout';

/**
 * How a field of a struct is laid out in bytes, and how it is compared.
 *
 * Internal. A struct is built from descriptors, and looks up the codec of each
 * field by the identity of its descriptor — so a field accepts the types of
 * this package and nothing merely shaped like one. Every type with a fixed
 * layout registers its own when its descriptor is made: the numeric types with
 * the same codec their `read` and `write` use, which keeps one encoding for a
 * value stored alone and the same value inside a struct.
 *
 * Every multi-byte value is little-endian, whatever the platform: bytes a
 * struct writes on one machine read back the same on any other, and it is the
 * order of every platform a JavaScript engine runs on in practice.
 */
export interface FieldCodec extends ByteCodec<unknown> {
	/**
	 * Compares two values as the field's own type does.
	 *
	 * @param left First value.
	 * @param right Second value.
	 * @returns `true` when they are equal.
	 */
	equals(left: unknown, right: unknown): boolean;
}

/**
 * Codecs of every type with a fixed layout — the numeric types, structs,
 * matrices, fractions, complex numbers and quaternions — so one can nest in
 * another.
 */
const registeredCodecs = new WeakMap<object, FieldCodec>();

/**
 * Registers the codec of a type, so that a struct can hold it as a field and a
 * matrix as an element.
 *
 * @param descriptor Descriptor of the type.
 * @param codec How it is stored.
 */
export const registerCodec = (descriptor: object, codec: FieldCodec): void => {
	registeredCodecs.set(descriptor, codec);
};

/**
 * Registers the codec of a type stored as a fixed number of values of one
 * element type, end to end: a matrix's elements, a quaternion's components.
 * Nothing is registered when the element type has no fixed layout, and the
 * type then has none either.
 *
 * @param descriptor Descriptor of the type.
 * @param element What the element type was declared with.
 * @param count How many elements a value holds.
 * @param assemble Makes a value from its elements, in stored order.
 * @param disassemble Lists a value's elements, in stored order.
 * @param equals How the type compares two values.
 */
export const registerRepeatedCodec = (
	descriptor: object,
	element: unknown,
	count: number,
	assemble: (elements: unknown[]) => unknown,
	disassemble: (value: unknown) => readonly unknown[],
	equals: (left: unknown, right: unknown) => boolean,
): void => {
	const codec: FieldCodec | undefined = codecOf(element);

	if (codec === undefined) return;

	const { size } = codec;

	registerCodec(descriptor, {
		size: size * count,
		alignment: codec.alignment,
		read: (view, offset) => {
			const elements: unknown[] = new Array<unknown>(count);

			for (let index = 0; index < count; index++) {
				elements[index] = codec.read(view, offset + index * size);
			}

			return assemble(elements);
		},
		write: (view, offset, value) => {
			const elements: readonly unknown[] = disassemble(value);

			for (let index = 0; index < count; index++) {
				codec.write(view, offset + index * size, elements[index]);
			}
		},
		equals,
	});
};

/**
 * The codec of a field's descriptor.
 *
 * @param descriptor What the field was declared with.
 * @returns Its codec, or `undefined` for a descriptor with no fixed layout.
 */
export const codecOf = (descriptor: unknown): FieldCodec | undefined => {
	if (typeof descriptor !== 'object' && typeof descriptor !== 'function') {
		return undefined;
	}

	if (descriptor === null) return undefined;

	return registeredCodecs.get(descriptor);
};
