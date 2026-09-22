/**
 * The runtime side of a numeric type: how a value becomes one, how one is
 * recognised, and the arithmetic that keeps it one.
 *
 * A type is erased on the way to JavaScript, so `SignedInteger<32>` alone cannot
 * check anything. Each numeric type therefore comes with a descriptor
 * implementing this contract, and the descriptor carries the same name as the
 * type:
 *
 * ```ts
 * const Int32 = SignedInteger(32);
 * const total: SignedInteger<32> = Int32.add(Int32.from(1), Int32.from(2));
 * ```
 *
 * The arithmetic is here, rather than left to the operators, because the
 * operators cannot keep the type's promise: `a + b` on two 32-bit integers is a
 * `number` that may no longer fit in 32 bits, and on two single precision
 * floats it is a double precision result nobody rounded. Every operation below
 * returns a value of the type or throws.
 *
 * @template T Type of the values this descriptor produces.
 * @template TSource What `from` accepts.
 */
export interface NumericType<T, TSource> {
	/** Name of the type, as it reads in an error message. */
	readonly name: string;

	/**
	 * Converts a value into this type.
	 *
	 * @param value Value to convert.
	 * @returns The value, as this type.
	 * @throws {RangeError} When the value cannot be represented, for the types
	 * that refuse rather than round.
	 * @throws {TypeError} When the value is not of an accepted kind.
	 */
	from(value: TSource): T;

	/**
	 * Tells whether a value already is of this type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when `from` would return the value unchanged.
	 */
	is(value: unknown): value is T;

	/**
	 * Adds two values.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The sum, as this type.
	 */
	add(left: T, right: T): T;

	/**
	 * Subtracts one value from another.
	 *
	 * @param left Value subtracted from.
	 * @param right Value subtracted.
	 * @returns The difference, as this type.
	 */
	subtract(left: T, right: T): T;

	/**
	 * Multiplies two values.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The product, as this type.
	 */
	multiply(left: T, right: T): T;

	/**
	 * Divides one value by another.
	 *
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The quotient, as this type.
	 */
	divide(left: T, right: T): T;

	/**
	 * The remainder of a division, carrying the sign of the dividend as `%`
	 * does.
	 *
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The remainder, as this type.
	 */
	remainder(left: T, right: T): T;
}
