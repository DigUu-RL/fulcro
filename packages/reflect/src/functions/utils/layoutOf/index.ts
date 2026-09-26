import {
	type TypeLayout,
	unresolvedLayout,
	type WithLayout,
} from '@/functions/utils/layout';

/**
 * The whole layout of a type: its size, its alignment and, for a struct, where
 * each field sits.
 *
 * ```ts
 * layoutOf<Vector3>();
 * // {
 * //   size: 12,
 * //   alignment: 4,
 * //   fields: {
 * //     x: { offset: 0, size: 4, alignment: 4 },
 * //     y: { offset: 4, size: 4, alignment: 4 },
 * //     z: { offset: 8, size: 4, alignment: 4 },
 * //   },
 * // }
 *
 * layoutOf<SignedInteger<32>>(); // { size: 4, alignment: 4, fields: {} }
 * ```
 *
 * Resolved entirely at compile time: the bundled transformer replaces the call
 * with a frozen object literal equal to the `layout` the struct's descriptor
 * carries, with the fields in the order they were declared. A type that
 * declares no layout fails the constraint and is a type error.
 *
 * @template T Type whose layout is read; it must declare one.
 * @returns The layout, frozen.
 * @throws {Error} Always, when the transformer is not enabled or the type
 * argument is a generic parameter.
 */
export const layoutOf = <T extends WithLayout>(): TypeLayout<T> => {
	throw unresolvedLayout('layoutOf<T>()');
};
