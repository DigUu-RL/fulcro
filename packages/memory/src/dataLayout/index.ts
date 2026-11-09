import { createError } from '@fulcro/errors';

import type { Allocation } from '@/src/allocator';
import type { BytePlacement } from '@/src/byteStorage';
import type { OperationNames } from '@/src/byteStorage/checkedStorage';
import type { FixedLayoutElement } from '@/src/element';
import type { ElementLayout, FieldBytes } from '@/src/element/fieldBytes';
import type { Storage } from '@/src/storage';

/** Marks a {@link DataLayout} as one this package made, in the type checker. */
declare const madeByThisPackage: unique symbol;

/**
 * How the values of a storage held as bytes are arranged in them: each value's
 * bytes together, one after the other, or each field's bytes together, one
 * field after the other.
 *
 * Only the layouts this package exports are one — `ArrayOfStructures` and
 * `StructureOfArrays` — so the type is not exported, and an object with the
 * same `name` is refused, by the type checker and at runtime.
 */
export interface DataLayout {
	/** Name of the layout, as it is exported. */
	readonly name: string;

	readonly [madeByThisPackage]: true;
}

/**
 * What a layout supplies to tell it from the others: how many bytes it needs,
 * how it reaches a whole value, and where one field of every value sits.
 *
 * Everything else — the checks, the errors, the allocation — is shared, so a
 * layout added later is one more of these and nothing else changes.
 */
export interface LayoutStrategy {
	/**
	 * How many bytes `length` values take in this layout.
	 *
	 * @param element Type of the values, already checked.
	 * @param fields Its fields, by offset, or `undefined` when it places none.
	 * @param length How many values, already checked.
	 * @returns The bytes to ask for.
	 */
	readonly byteLength: (
		element: ElementLayout,
		fields: readonly FieldBytes[] | undefined,
		length: number,
	) => number;

	/**
	 * Builds the storage over bytes laid out this way.
	 *
	 * @param element Type of the values, already checked.
	 * @param fields Its fields, by offset, or `undefined` when it places none.
	 * @param length How many values, already checked.
	 * @param view The bytes, `byteLength` of them.
	 * @param names How `get` and `set` are named in an error message.
	 * @param allocation Where the bytes came from, when an allocator lent them.
	 * @returns The storage, frozen.
	 */
	readonly createStorage: <T>(
		element: FixedLayoutElement<T>,
		fields: readonly FieldBytes[] | undefined,
		length: number,
		view: DataView,
		names: OperationNames,
		allocation?: Allocation,
	) => Storage<T>;

	/**
	 * Where one field of every value sits in bytes laid out this way.
	 *
	 * @param element Type of the values.
	 * @param field The field.
	 * @param length How many values the storage holds.
	 * @returns The byte the field of the first value starts at, and the bytes
	 * from it to the same field of the next.
	 */
	readonly fieldPlacement: (
		element: ElementLayout,
		field: FieldBytes,
		length: number,
	) => BytePlacement;
}

/** Every layout this package made, with what it supplies. */
const strategies = new WeakMap<object, LayoutStrategy>();

/**
 * Makes a layout from what tells it from the others.
 *
 * @param name Name of the layout, as it is exported.
 * @param strategy What it supplies.
 * @returns The layout, frozen: a value that carries its name and nothing a
 * consumer can call.
 */
export const defineDataLayout = (name: string, strategy: LayoutStrategy): DataLayout => {
	const layout = Object.freeze({ name }) as DataLayout;

	strategies.set(layout, strategy);

	return layout;
};

/**
 * Describes what was handed in as a layout, for an error message.
 *
 * @param received What was handed in.
 * @returns Its name, when it has one, or its kind.
 */
const describeLayout = (received: unknown): string => {
	if (received === null) return 'null';
	if (typeof received !== 'object') return typeof received;

	const { name } = received as { readonly name?: unknown };

	return typeof name === 'string' ? `an object named '${name}'` : 'an object';
};

/**
 * What a layout supplies, refusing anything that is not one this package made.
 *
 * @param operation Operation being performed, for the error message.
 * @param layout What was handed in as the layout.
 * @returns What it supplies.
 * @throws {TypeError} When it is not `ArrayOfStructures` or
 * `StructureOfArrays`.
 */
export const strategyOf = (operation: string, layout: unknown): LayoutStrategy => {
	const strategy: LayoutStrategy | undefined =
		typeof layout === 'object' && layout !== null ? strategies.get(layout) : undefined;

	if (strategy === undefined) {
		throw createError('FULCRO7031', { operation, received: describeLayout(layout) });
	}

	return strategy;
};

/**
 * Everything a storage held as bytes was made from: what a view of one of its
 * fields needs to find that field, and what a tool inspecting memory reports.
 */
export interface StoredLayout {
	readonly element: ElementLayout;
	readonly fields: readonly FieldBytes[] | undefined;
	readonly length: number;
	readonly view: DataView;
	readonly layout: DataLayout;
	readonly allocation: Allocation | undefined;
}

/**
 * The layout of every storage this package made over bytes, by the storage.
 *
 * Kept here rather than on the storage, which would add a member to the
 * `Storage<T>` contract every other storage then has to carry.
 */
const storedLayouts = new WeakMap<object, StoredLayout>();

/**
 * Builds a storage over bytes in a layout, and keeps what it was made from.
 *
 * @param strategy What the layout supplies.
 * @param element Type of the values, already checked.
 * @param stored What the storage is made from, the strategy's bytes included;
 * its `element` is `element`.
 * @param names How `get` and `set` are named in an error message.
 * @returns The storage, frozen.
 */
export const createLaidOutStorage = <T>(
	strategy: LayoutStrategy,
	element: FixedLayoutElement<T>,
	stored: StoredLayout,
	names: OperationNames,
): Storage<T> => {
	const storage: Storage<T> = strategy.createStorage(
		element,
		stored.fields,
		stored.length,
		stored.view,
		names,
		stored.allocation,
	);

	storedLayouts.set(storage, stored);

	return storage;
};

/**
 * What a storage held as bytes was made from.
 *
 * @param storage The storage.
 * @returns What it was made from, or `undefined` for any other storage.
 */
export const storedLayoutOf = (storage: unknown): StoredLayout | undefined => {
	return typeof storage === 'object' && storage !== null ? storedLayouts.get(storage) : undefined;
};
