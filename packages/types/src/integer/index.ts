import { createError } from '@fulcro/errors';

import type { BoundedNumericType } from '@/numericType';

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
 * naming the operation, the value and the range. `wrap` is the one exception,
 * and the explicit way to ask for modular arithmetic.
 *
 * @template T Type of the values this descriptor produces.
 */
export interface IntegerType<T> extends BoundedNumericType<T, number | bigint> {
	/** Width of the type, in bits. */
	readonly width: IntegerWidth;

	/** Whether the range includes negative values. */
	readonly signed: boolean;

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
	 * Divides, truncating the quotient towards zero as `BigInt` division does.
	 *
	 * @param left Dividend.
	 * @param right Divisor.
	 * @returns The truncated quotient.
	 * @throws {RangeError} On a zero divisor, and on the one quotient a signed
	 * type cannot hold: its minimum divided by `-1`.
	 */
	divide(left: T, right: T): T;

	/**
	 * The bits set in both, as `&` computes them.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The conjunction of the bits.
	 */
	bitwiseAnd(left: T, right: T): T;

	/**
	 * The bits set in either, as `|` computes them.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The disjunction of the bits.
	 */
	bitwiseOr(left: T, right: T): T;

	/**
	 * The bits set in exactly one, as `^` computes them.
	 *
	 * @param left First operand.
	 * @param right Second operand.
	 * @returns The exclusive disjunction of the bits.
	 */
	bitwiseXor(left: T, right: T): T;

	/**
	 * Every bit of the width flipped, as `~` does.
	 *
	 * @param value Operand.
	 * @returns The complement, within the width.
	 */
	bitwiseNot(value: T): T;

	/**
	 * Shifts the bits towards the most significant end, as `<<` does. Bits
	 * shifted past the width are discarded: a shift is a bit operation, never
	 * an overflow.
	 *
	 * @param value Operand.
	 * @param count Places to shift, from 0 to `width - 1`.
	 * @returns The shifted value, within the width.
	 * @throws {RangeError} When the count is outside 0 … `width - 1`.
	 */
	shiftLeft(value: T, count: T): T;

	/**
	 * Shifts the bits towards the least significant end, as `>>` does: copying
	 * the sign bit in on a signed type, and zeros on an unsigned one.
	 *
	 * @param value Operand.
	 * @param count Places to shift, from 0 to `width - 1`.
	 * @returns The shifted value.
	 * @throws {RangeError} When the count is outside 0 … `width - 1`.
	 */
	shiftRight(value: T, count: T): T;

	/**
	 * Shifts the bits towards the least significant end with zeros coming in,
	 * as `>>>` does — on a signed type, over the bits of its own width, and read
	 * back as signed.
	 *
	 * ```ts
	 * const Int32 = SignedInteger(32);
	 *
	 * Int32.shiftRightLogical(Int32.from(-1), Int32.from(28)); // 15
	 * ```
	 *
	 * @param value Operand.
	 * @param count Places to shift, from 0 to `width - 1`.
	 * @returns The shifted value.
	 * @throws {RangeError} When the count is outside 0 … `width - 1`.
	 */
	shiftRightLogical(value: T, count: T): T;
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
	throw createError('FULCRO6028', `${name}.${operation}`, typeof value);
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
	throw createError('FULCRO6002', `${name}.${operation}`, describeValue(value));
};

/**
 * Fails a power whose exponent is negative, which has no integer result.
 *
 * @param name Name of the type.
 * @param exponent Exponent it was handed.
 * @returns Never.
 */
const rejectNegativeExponent = (name: string, exponent: unknown): never => {
	throw createError('FULCRO6005', `${name}.power`, describeValue(exponent));
};

/**
 * Fails a shift whose count is outside the width.
 *
 * @param name Name of the type.
 * @param operation Shift being performed.
 * @param width Width of the type.
 * @param count Count it was handed.
 * @returns Never.
 */
const rejectCount = (
	name: string,
	operation: string,
	width: number,
	count: unknown,
): never => {
	throw createError(
		'FULCRO6029',
		`${name}.${operation}`,
		width - 1,
		describeValue(count),
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
		throw createError(
			'FULCRO6030',
			signed ? 'SignedInteger' : 'UnsignedInteger',
			INTEGER_WIDTHS.join(', '),
			describeValue(width),
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
			throw createError(
				'FULCRO6031',
				`${name}.${operation}`,
				describeValue(value),
				range,
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
			throw createError('FULCRO6001', `${name}.${operation}`);
		}
	};

	/** The bits of the width, for reading a narrow signed value as unsigned. */
	const mask: number = width === 32 ? 0xffff_ffff : 2 ** width - 1;

	/**
	 * Accepts a shift count within the width.
	 *
	 * @param operation Shift being performed.
	 * @param count Count it was handed.
	 * @returns The count.
	 */
	const requireCount = (operation: string, count: T): number => {
		const places = count as number;

		if (places < 0 || places >= width) {
			return rejectCount(name, operation, width, places);
		}

		return places;
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
					throw createError(
						'FULCRO6031',
						`${name}.from`,
						describeValue(value),
						range,
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

		// By squaring, each product checked as `multiply` checks it. The base is
		// only squared while a higher bit of the exponent remains, and then the
		// result will include that square as a factor — so a square out of range
		// means a result out of range, never a false alarm.
		power: (base: T, exponent: T): T => {
			let remaining: number = exponent as number;

			if (remaining < 0) return rejectNegativeExponent(name, remaining);

			let result = 1;
			let factor: number = base as number;

			while (remaining > 0) {
				if (remaining % 2 === 1) {
					result = accept('power', result * factor) as number;
				}

				remaining = Math.floor(remaining / 2);

				if (remaining > 0) factor = accept('power', factor * factor) as number;
			}

			return accept('power', result);
		},

		negate: (value: T): T => accept('negate', -(value as number)),

		increment: (value: T): T => accept('increment', (value as number) + 1),

		decrement: (value: T): T => accept('decrement', (value as number) - 1),

		equals: (left: T, right: T): boolean => left === right,
		lessThan: (left: T, right: T): boolean => left < right,
		lessThanOrEqual: (left: T, right: T): boolean => left <= right,
		greaterThan: (left: T, right: T): boolean => left > right,
		greaterThanOrEqual: (left: T, right: T): boolean => left >= right,

		// Two values in range combine, through the engine's 32-bit operators,
		// into a value whose low `width` bits are the answer; truncating keeps
		// exactly those, sign-extended or masked as the type is.
		bitwiseAnd: (left: T, right: T): T =>
			truncate((left as number) & (right as number)) as T,

		bitwiseOr: (left: T, right: T): T =>
			truncate((left as number) | (right as number)) as T,

		bitwiseXor: (left: T, right: T): T =>
			truncate((left as number) ^ (right as number)) as T,

		bitwiseNot: (value: T): T => truncate(~(value as number)) as T,

		shiftLeft: (value: T, count: T): T =>
			truncate((value as number) << requireCount('shiftLeft', count)) as T,

		// Arithmetic on a signed type, whose values are already sign-correct
		// numbers; on an unsigned one the value is non-negative, so the two
		// shifts agree except at 32 bits, where only `>>>` reads it as unsigned.
		shiftRight: (value: T, count: T): T => {
			const places: number = requireCount('shiftRight', count);

			return (
				signed ? (value as number) >> places : (value as number) >>> places
			) as T;
		},

		shiftRightLogical: (value: T, count: T): T => {
			const places: number = requireCount('shiftRightLogical', count);
			const bits: number =
				width === 32 ? (value as number) >>> 0 : (value as number) & mask;

			return truncate(bits >>> places) as T;
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
			throw createError(
				'FULCRO6031',
				`${name}.${operation}`,
				describeValue(reported),
				range,
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
			throw createError('FULCRO6001', `${name}.${operation}`);
		}
	};

	/**
	 * Keeps the low `width` bits of a result, sign-extended or not as the type
	 * is.
	 *
	 * @param value Result of a bit operation, of any size.
	 * @returns The value, as this type.
	 */
	const wrapBits = (value: bigint): T =>
		(signed ? BigInt.asIntN(width, value) : BigInt.asUintN(width, value)) as T;

	/**
	 * Accepts a shift count within the width.
	 *
	 * @param operation Shift being performed.
	 * @param count Count it was handed.
	 * @returns The count.
	 */
	const requireCount = (operation: string, count: T): bigint => {
		const places = count as bigint;

		if (places < 0n || places >= BigInt(width)) {
			return rejectCount(name, operation, width, places);
		}

		return places;
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

		// Any base of magnitude two or more overflows every width once the
		// exponent reaches that width, so a large exponent is refused before the
		// power is built — `2n ** 1_000_000_000n` would otherwise spend its time
		// building a number only to reject it.
		power: (base: T, exponent: T): T => {
			const power = exponent as bigint;
			const value = base as bigint;

			if (power < 0n) return rejectNegativeExponent(name, power);

			const magnitude: bigint = value < 0n ? -value : value;

			if (magnitude >= 2n && power >= BigInt(width)) {
				throw createError(
					'FULCRO6032',
					name,
					describeValue(value),
					describeValue(power),
					range,
				);
			}

			return accept('power', value ** power);
		},

		negate: (value: T): T => accept('negate', -(value as bigint)),

		increment: (value: T): T => accept('increment', (value as bigint) + 1n),

		decrement: (value: T): T => accept('decrement', (value as bigint) - 1n),

		equals: (left: T, right: T): boolean => left === right,
		lessThan: (left: T, right: T): boolean => left < right,
		lessThanOrEqual: (left: T, right: T): boolean => left <= right,
		greaterThan: (left: T, right: T): boolean => left > right,
		greaterThanOrEqual: (left: T, right: T): boolean => left >= right,

		bitwiseAnd: (left: T, right: T): T =>
			wrapBits((left as bigint) & (right as bigint)),

		bitwiseOr: (left: T, right: T): T =>
			wrapBits((left as bigint) | (right as bigint)),

		bitwiseXor: (left: T, right: T): T =>
			wrapBits((left as bigint) ^ (right as bigint)),

		bitwiseNot: (value: T): T => wrapBits(~(value as bigint)),

		shiftLeft: (value: T, count: T): T =>
			wrapBits((value as bigint) << requireCount('shiftLeft', count)),

		// `bigint` shifts are arithmetic, which is right for a signed type and,
		// for the non-negative values of an unsigned one, the same as logical.
		shiftRight: (value: T, count: T): T =>
			((value as bigint) >> requireCount('shiftRight', count)) as T,

		shiftRightLogical: (value: T, count: T): T =>
			wrapBits(
				BigInt.asUintN(width, value as bigint) >>
					requireCount('shiftRightLogical', count),
			),
	};
};
