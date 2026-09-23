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

	/**
	 * Raises a value to a power, as `**` does.
	 *
	 * @param base Value raised.
	 * @param exponent Power it is raised to, of the same type.
	 * @returns The power, as this type.
	 * @throws {RangeError} For an integer type, on a negative exponent or a
	 * result outside the range.
	 */
	power(base: T, exponent: T): T;

	/**
	 * The value with its sign flipped, as unary `-` does.
	 *
	 * @param value Value negated.
	 * @returns The negation, as this type.
	 * @throws {RangeError} For an integer type whose range cannot hold it: the
	 * minimum of a signed type, and anything but zero of an unsigned one.
	 */
	negate(value: T): T;

	/**
	 * The value plus one, as `++` computes it.
	 *
	 * @param value Value incremented.
	 * @returns The next value, as this type.
	 */
	increment(value: T): T;

	/**
	 * The value minus one, as `--` computes it.
	 *
	 * @param value Value decremented.
	 * @returns The previous value, as this type.
	 */
	decrement(value: T): T;

	/**
	 * Tells whether two values are equal, as `===` does: `NaN` equals nothing,
	 * and `0` equals `-0`.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when they are equal.
	 */
	equals(left: T, right: T): boolean;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when `left` is smaller, as `<` answers.
	 */
	lessThan(left: T, right: T): boolean;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when `left` is smaller or equal, as `<=` answers.
	 */
	lessThanOrEqual(left: T, right: T): boolean;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when `left` is larger, as `>` answers.
	 */
	greaterThan(left: T, right: T): boolean;

	/**
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns `true` when `left` is larger or equal, as `>=` answers.
	 */
	greaterThanOrEqual(left: T, right: T): boolean;
}

/**
 * A numeric type with a largest and a smallest value: every type here except
 * `BigInteger`, whose values are as large as memory allows.
 *
 * `minimum` is the most negative finite value, not the smallest positive one —
 * the meaning `Number.MIN_VALUE` gives the name, and the one that makes a
 * range check with it wrong. For an unsigned integer it is zero.
 *
 * ```ts
 * HalfPrecisionFloat.maximum; // 65504
 * HalfPrecisionFloat.minimum; // -65504
 * UnsignedInteger(8).minimum; // 0
 * ```
 *
 * @template T Type of the values this descriptor produces.
 * @template TSource What `from` accepts.
 */
export interface BoundedNumericType<T, TSource> extends NumericType<
	T,
	TSource
> {
	/** Smallest finite value of the type. */
	readonly minimum: T;

	/** Largest finite value of the type. */
	readonly maximum: T;
}
