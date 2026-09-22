/**
 * Key of the brand, declared and never defined.
 *
 * A `unique symbol` rather than a string so that no consumer can spell the
 * brand by hand: the only way to hold a `SignedInteger<32>` is to be given one
 * by the function that checked it.
 */
declare const brand: unique symbol;

/**
 * A primitive tagged, at the type level only, with the name of the numeric type
 * it was checked against.
 *
 * Nothing of this exists at runtime — a branded `number` is a `number` — which is
 * what lets a consumer take only the types of this package and pay for no code.
 * The price is that the brand does not survive arithmetic written with the
 * operators: `a + b` is a plain `number` again, and has to go back through the
 * type's own `add` to be one of ours.
 *
 * @template TBase Primitive that carries the value.
 * @template TName Name of the numeric type the value was checked against.
 */
export type Branded<TBase, TName extends string> = TBase & {
	readonly [brand]: TName;
};
