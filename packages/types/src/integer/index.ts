import type { NumericType } from '@/numericType';

/**
 * Machinery shared by `SignedInteger` and `UnsignedInteger`.
 *
 * The two differ only in where their range starts, so everything else — the
 * range check, the modular conversion, the checked arithmetic — is written once
 * here. Nothing in this module is exported by the package except the two types
 * a signature needs: `IntegerWidth` and `IntegerType`.
 */

/** The widths a fixed-width integer comes in, in bits. */
export type IntegerWidth = 8 | 16 | 32 | 64 | 128;

/** Every width, for validating the argument a descriptor is built from. */
const INTEGER_WIDTHS: readonly IntegerWidth[] = [8, 16, 32, 64, 128];

/** Size, and alignment, of each width in bytes. */
interface ByteSizes {
	readonly 8: 1;
	readonly 16: 2;
	readonly 32: 4;
	readonly 64: 8;
	readonly 128: 16;
}

/**
 * Size of an integer of a width, in bytes; its alignment is the same number,
 * as it is for every fixed-width integer on the platforms that define one.
 *
 * @template N Width, in bits.
 */
export type ByteSize<N extends IntegerWidth> = ByteSizes[N];

/**
 * The primitive an integer of a width is carried by.
 *
 * Up to 32 bits a `number` holds every value exactly and costs nothing. From 64
 * bits it cannot — a `number` is exact only up to 2^53 — so the value is a
 * `bigint`, and a consumer sees that in the type rather than discovering it as
 * a lost digit.
 *
 * @template N Width, in bits.
 */
export type IntegerRepresentation<N extends IntegerWidth> = N extends 64 | 128
	? bigint
	: number;

/**
 * Descriptor of a fixed-width integer type.
 *
 * Every operation is checked: a result outside the range throws a `RangeError`
 * naming the operation, the value and the range, as a C# `checked` context
 * does. `wrap` is the one exception, and the explicit way to ask for the
 * modular behaviour of an `unchecked` conversion.
 *
 * @template T Type of the values this descriptor produces.
 */
export interface IntegerType<T> extends NumericType<T, number | bigint> {
	/** Width of the type, in bits. */
	readonly width: IntegerWidth;

	/** Whether the range includes negative values. */
	readonly signed: boolean;

	/** Smallest value of the type. */
	readonly minimum: T;

	/** Largest value of the type. */
	readonly maximum: T;

	/**
	 * Converts an integer into this type modulo 2^width, as a two's complement
	 * truncation does. Never throws for an integer, whatever its size.
	 *
	 * ```ts
	 * SignedInteger(8).wrap(200); // -56
	 * UnsignedInteger(8).wrap(-1); // 255
	 * ```
	 *
	 * @param value Integer to convert.
	 * @returns The value congruent to it within the range.
	 * @throws {RangeError} When the value is a `number` that is not an integer.
	 */
	wrap(value: number | bigint): T;

	/**
	 * Divides, truncating the quotient towards zero as integer division does in
	 * C#, Java and `BigInt`.
	 *
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The truncated quotient.
	 * @throws {RangeError} On a zero divisor, and on the one quotient a signed
	 * type cannot hold: its minimum divided by `-1`.
	 */
	divide(left: T, right: T): T;
}

/**
 * Formats a range for an error message.
 *
 * @param minimum Smallest value.
 * @param maximum Largest value.
 * @returns The range, as `[minimum, maximum]`.
 */
const describeRange = (minimum: bigint, maximum: bigint): string =>
	`[${minimum}, ${maximum}]`;

/**
 * Describes a value for an error message without letting a stray `-0` read as
 * `0` or a `bigint` lose its suffix.
 *
 * @param value Value being reported.
 * @returns The value as the caller wrote it.
 */
const describeValue = (value: unknown): string => {
	if (typeof value === 'bigint') return `${value}n`;
	if (Object.is(value, -0)) return '-0';

	return String(value);
};

/**
 * Fails a conversion whose input is not a number or a bigint at all.
 *
 * @param name Name of the type converting.
 * @param operation Operation being performed.
 * @param value Value it was handed.
 * @returns Never.
 */
const rejectKind = (name: string, operation: string, value: unknown): never => {
	throw new TypeError(
		`${name}.${operation}: expected a number or a bigint, received ${typeof value}.`,
	);
};

/**
 * Fails a conversion of a number that has a fractional part, or is not finite.
 *
 * @param name Name of the type converting.
 * @param operation Operation being performed.
 * @param value Value it was handed.
 * @returns Never.
 */
const rejectFraction = (
	name: string,
	operation: string,
	value: number,
): never => {
	throw new RangeError(
		`${name}.${operation}: expected an integer, received ${describeValue(value)}.`,
	);
};

/**
 * Builds the descriptor of one signedness and width.
 *
 * Two implementations behind one interface: the widths a `number` holds work in
 * `number` throughout and never touch a `bigint`, and the wider ones work in
 * `bigint` throughout. Mixing the two would make every 32-bit addition pay for
 * a conversion it never needed, which the performance suite counts.
 *
 * @param signed Whether the range includes negative values.
 * @param width Width, in bits.
 * @param name Name of the type, as it reads in an error message.
 * @returns The descriptor.
 * @throws {RangeError} When the width is not one of {@link IntegerWidth}.
 */
export const createIntegerType = <T>(
	signed: boolean,
	width: IntegerWidth,
	name: string,
): IntegerType<T> => {
	if (!INTEGER_WIDTHS.includes(width)) {
		throw new RangeError(
			`${signed ? 'SignedInteger' : 'UnsignedInteger'}: expected a width of ${INTEGER_WIDTHS.join(', ')} bits, received ${describeValue(width)}.`,
		);
	}

	const minimum: bigint = signed ? -(1n << BigInt(width - 1)) : 0n;
	const maximum: bigint = signed
		? (1n << BigInt(width - 1)) - 1n
		: (1n << BigInt(width)) - 1n;

	return width >= 64
		? createBigIntegerType<T>(signed, width, name, minimum, maximum)
		: createNumberIntegerType<T>(signed, width, name, minimum, maximum);
};

/**
 * Builds the descriptor of a width carried by a `number`.
 *
 * @param signed Whether the range includes negative values.
 * @param width Width, in bits.
 * @param name Name of the type.
 * @param minimum Smallest value.
 * @param maximum Largest value.
 * @returns The descriptor.
 */
const createNumberIntegerType = <T>(
	signed: boolean,
	width: IntegerWidth,
	name: string,
	minimum: bigint,
	maximum: bigint,
): IntegerType<T> => {
	const low: number = Number(minimum);
	const high: number = Number(maximum);
	const range: string = describeRange(minimum, maximum);

	/**
	 * Accepts a result that fits, normalising `-0` to `0`.
	 *
	 * `-0` fits every range, but an integer has one zero: letting the negative
	 * one through would make `Object.is` tell two equal integers apart.
	 *
	 * @param operation Operation that produced the value.
	 * @param value Exact result of the operation.
	 * @returns The value, as this type.
	 */
	const accept = (operation: string, value: number): T => {
		if (value < low || value > high) {
			throw new RangeError(
				`${name}.${operation}: ${describeValue(value)} is outside ${range}.`,
			);
		}

		return (value === 0 ? 0 : value) as T;
	};

	// Two's complement truncation, done by the engine's own 32-bit conversions:
	// `| 0` and `>>> 0` reduce any finite integer modulo 2^32 exactly, and the
	// shifts then sign-extend or mask down to the narrower widths.
	const truncate: (value: number) => number =
		width === 32
			? signed
				? (value) => value | 0
				: (value) => value >>> 0
			: signed
				? (value) => (value << (32 - width)) >> (32 - width)
				: (value) => value & (2 ** width - 1);

	/**
	 * Refuses a zero divisor.
	 *
	 * @param operation Operation being performed.
	 * @param divisor Divisor it was handed.
	 */
	const requireDivisor = (operation: string, divisor: number): void => {
		if (divisor === 0) {
			throw new RangeError(`${name}.${operation}: division by zero.`);
		}
	};

	return {
		name,
		width,
		signed,
		minimum: low as T,
		maximum: high as T,

		from: (value: number | bigint): T => {
			if (typeof value === 'bigint') {
				if (value < minimum || value > maximum) {
					throw new RangeError(
						`${name}.from: ${describeValue(value)} is outside ${range}.`,
					);
				}

				return Number(value) as T;
			}

			if (typeof value !== 'number') return rejectKind(name, 'from', value);
			if (!Number.isInteger(value)) return rejectFraction(name, 'from', value);

			return accept('from', value);
		},

		wrap: (value: number | bigint): T => {
			if (typeof value === 'bigint') {
				return Number(
					signed ? BigInt.asIntN(width, value) : BigInt.asUintN(width, value),
				) as T;
			}

			if (typeof value !== 'number') return rejectKind(name, 'wrap', value);
			if (!Number.isInteger(value)) return rejectFraction(name, 'wrap', value);

			const wrapped: number = truncate(value);

			return (wrapped === 0 ? 0 : wrapped) as T;
		},

		is: (value: unknown): value is T =>
			typeof value === 'number' &&
			Number.isInteger(value) &&
			value >= low &&
			value <= high,

		add: (left: T, right: T): T =>
			accept('add', (left as number) + (right as number)),

		subtract: (left: T, right: T): T =>
			accept('subtract', (left as number) - (right as number)),

		// Exact below 2^53, and any product at or beyond it is already out of
		// every range carried by a `number`, rounded or not — so checking the
		// rounded product decides the exact one correctly.
		multiply: (left: T, right: T): T =>
			accept('multiply', (left as number) * (right as number)),

		// For operands under 2^32 the quotient sits at least 1/|dividend| away
		// from the next integer, which is further than a double can round, so
		// truncating the floating quotient gives the integer one.
		divide: (left: T, right: T): T => {
			requireDivisor('divide', right as number);

			return accept('divide', Math.trunc((left as number) / (right as number)));
		},

		remainder: (left: T, right: T): T => {
			requireDivisor('remainder', right as number);

			return accept('remainder', (left as number) % (right as number));
		},
	};
};

/**
 * Builds the descriptor of a width carried by a `bigint`.
 *
 * @param signed Whether the range includes negative values.
 * @param width Width, in bits.
 * @param name Name of the type.
 * @param minimum Smallest value.
 * @param maximum Largest value.
 * @returns The descriptor.
 */
const createBigIntegerType = <T>(
	signed: boolean,
	width: IntegerWidth,
	name: string,
	minimum: bigint,
	maximum: bigint,
): IntegerType<T> => {
	const range: string = describeRange(minimum, maximum);

	/**
	 * Accepts a result that fits.
	 *
	 * @param operation Operation that produced the value.
	 * @param value Exact result of the operation.
	 * @param reported The value as the caller wrote it, when it arrived as a
	 * `number` and was converted: the message repeats what was passed.
	 * @returns The value, as this type.
	 */
	const accept = (
		operation: string,
		value: bigint,
		reported: number | bigint = value,
	): T => {
		if (value < minimum || value > maximum) {
			throw new RangeError(
				`${name}.${operation}: ${describeValue(reported)} is outside ${range}.`,
			);
		}

		return value as T;
	};

	/**
	 * Turns an accepted input into a `bigint`.
	 *
	 * @param operation Operation being performed.
	 * @param value Value it was handed.
	 * @returns The value, as a `bigint`.
	 */
	const toBigInt = (operation: string, value: number | bigint): bigint => {
		if (typeof value === 'bigint') return value;
		if (typeof value !== 'number') return rejectKind(name, operation, value);
		if (!Number.isInteger(value)) return rejectFraction(name, operation, value);

		return BigInt(value);
	};

	/**
	 * Refuses a zero divisor, which `bigint` would also refuse, but without
	 * saying which type or operation it was.
	 *
	 * @param operation Operation being performed.
	 * @param divisor Divisor it was handed.
	 */
	const requireDivisor = (operation: string, divisor: bigint): void => {
		if (divisor === 0n) {
			throw new RangeError(`${name}.${operation}: division by zero.`);
		}
	};

	return {
		name,
		width,
		signed,
		minimum: minimum as T,
		maximum: maximum as T,

		from: (value: number | bigint): T =>
			accept('from', toBigInt('from', value), value),

		wrap: (value: number | bigint): T => {
			const integer: bigint = toBigInt('wrap', value);

			return (
				signed ? BigInt.asIntN(width, integer) : BigInt.asUintN(width, integer)
			) as T;
		},

		is: (value: unknown): value is T =>
			typeof value === 'bigint' && value >= minimum && value <= maximum,

		add: (left: T, right: T): T =>
			accept('add', (left as bigint) + (right as bigint)),

		subtract: (left: T, right: T): T =>
			accept('subtract', (left as bigint) - (right as bigint)),

		multiply: (left: T, right: T): T =>
			accept('multiply', (left as bigint) * (right as bigint)),

		// `bigint` division already truncates towards zero.
		divide: (left: T, right: T): T => {
			requireDivisor('divide', right as bigint);

			return accept('divide', (left as bigint) / (right as bigint));
		},

		remainder: (left: T, right: T): T => {
			requireDivisor('remainder', right as bigint);

			return accept('remainder', (left as bigint) % (right as bigint));
		},
	};
};
