/**
 * The memory layout a type declares, carried by the type and never by a value.
 *
 * ```ts
 * type SignedInteger<32> = … & Layout<4, 4>;
 * ```
 *
 * This is a protocol between packages rather than a type either of them owns.
 * `sizeOf<T>()` and `alignOf<T>()` in `@fulcro/reflect` read the property
 * through the type checker, at compile time, and constrain `T` to carry it — so
 * `sizeOf<BigInteger>()`, which has no fixed layout, is a type error rather
 * than a wrong number. Neither package imports the other for this: the shape is
 * the whole agreement, which is also what lets a later value type declare its
 * own layout without depending on this package.
 *
 * The key is a string with a leading `~`, not a symbol, because a symbol would
 * have to be imported to be named, and naming it is exactly what the other side
 * of the protocol needs to do. The tilde sorts the key after every real member
 * in an editor's completion list — the convention Standard Schema settled on
 * for its `~standard` property, for the same reason.
 *
 * The property is declared, never assigned: reading it at runtime yields
 * `undefined`.
 *
 * @template TSize Size of the type, in bytes.
 * @template TAlignment Alignment of the type, in bytes.
 */
export interface Layout<TSize extends number, TAlignment extends number> {
	readonly '~layout': {
		readonly size: TSize;
		readonly alignment: TAlignment;
	};
}
