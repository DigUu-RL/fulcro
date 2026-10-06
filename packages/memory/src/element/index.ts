import { createError } from '@fulcro/errors';

/**
 * What values are stored as bytes with: a type that occupies a known number of
 * bytes and reads and writes itself at an offset.
 *
 * Stated by its shape rather than imported, so this package depends on no
 * type system: every struct `@fulcro/types` declares already has this shape,
 * and any other type that grows it is accepted without this module changing.
 *
 * @template T Type of the values.
 */
export interface FixedLayoutElement<T> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/** How many bytes one value occupies, padding to the next one included. */
	readonly layout: { readonly size: number };

	/**
	 * Reads a value from bytes.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts.
	 * @returns The value.
	 */
	read(view: DataView, offset: number): T;

	/**
	 * Writes a value into bytes.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts.
	 * @param value Value to write.
	 */
	write(view: DataView, offset: number, value: T): void;

	/**
	 * Tells whether a value is one of this type's.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is T;
}

/**
 * A {@link FixedLayoutElement} that also says where its values may start: what
 * an allocator is asked to align the bytes to.
 *
 * A separate shape rather than a field added to the first, because
 * `createFixedBufferStorage` makes its own buffer, which starts at zero and is
 * aligned to anything, and so never needed to ask.
 *
 * @template T Type of the values.
 */
export interface AlignedElement<T> extends FixedLayoutElement<T> {
	/** Size of one value, and the alignment its first byte needs. */
	readonly layout: { readonly size: number; readonly alignment: number };
}

/**
 * Names the first part of {@link FixedLayoutElement} a value lacks.
 *
 * @param element Value handed in as the element type.
 * @returns The missing part, or `undefined` when nothing is missing.
 */
const missingPart = (element: unknown): string | undefined => {
	if (typeof element !== 'object' || element === null) return 'everything';

	const candidate = element as Partial<Record<string, unknown>>;
	const layout = candidate.layout as { size?: unknown } | null | undefined;

	if (typeof candidate.name !== 'string') return 'name';
	if (
		typeof layout !== 'object' ||
		layout === null ||
		!Number.isSafeInteger(layout.size) ||
		(layout.size as number) <= 0
	) {
		return 'layout.size';
	}

	return ['read', 'write', 'is'].find(
		(method) => typeof candidate[method] !== 'function',
	);
};

/**
 * Refuses an element type values cannot be stored as bytes with, before
 * anything is allocated.
 *
 * @param operation Operation being performed, for the error message.
 * @param element Value handed in as the element type.
 * @throws {TypeError} When it lacks a name, a layout size, or `read`, `write`
 * or `is`.
 */
export const requireElement = (operation: string, element: unknown): void => {
	const missing: string | undefined = missingPart(element);

	if (missing !== undefined) {
		throw createError('FULCRO7003', { operation, missing });
	}
};
