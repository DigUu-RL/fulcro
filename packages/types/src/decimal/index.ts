import { requireRoundingMode, type RoundingMode } from '@/roundingMode';

import {
	addParts,
	compareParts,
	divideParts,
	multiplyParts,
	powerParts,
	remainderParts,
	roundParts,
} from './arithmetic';
import {
	formatDecimal,
	formatExponential,
	formatFixed,
	formatPrecision,
	requireDigits,
} from './format';
import { parseDecimal } from './parse';
import {
	type DecimalParts,
	infinity,
	isZero,
	MAXIMUM_ADJUSTED_EXPONENT,
	NOT_A_NUMBER,
	powerOfTen,
	PRECISION,
	zero,
} from './parts';

/** Rounding applied wherever a mode is optional. */
const DEFAULT_MODE: RoundingMode = 'halfEven';

/**
 * A decimal floating point number with the semantics of IEEE 754 decimal128:
 * thirty-four significant digits, exponents from -6143 to 6144, and the
 * special values `NaN`, `Infinity`, `-Infinity` and `-0`.
 *
 * ```ts
 * const price = Decimal.from('19.99');
 *
 * price.multiply(Decimal.from(3)).toString(); // '59.97'
 * Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3')); // true
 * ```
 *
 * The semantics are those of the TC39 Decimal proposal, so that code written
 * against this class reads the same against a native one:
 *
 * - **Trailing zeros are not observable.** `'1.20'` and `'1.2'` are the same
 *   value and print the same way.
 * - **Every operation rounds once**, to thirty-four digits, half to even unless
 *   a mode is given. An exact result is never rounded.
 * - **Operators refuse it.** `a + b`, `a < b` and `a == 1` throw a `TypeError`
 *   instead of coercing: an implicit conversion to `number` would lose exactly
 *   the digits the type exists to keep. Use the methods.
 * - **Division by zero is not an error**, as in IEEE 754: it gives an infinity,
 *   and zero over zero gives `NaN`.
 *
 * Values are immutable. The layout is sixteen bytes aligned on sixteen, that of
 * decimal128 — which is what `sizeOf<Decimal>()` reports, not what an instance
 * costs in a JavaScript heap.
 */
export class Decimal {
	/** Layout of decimal128, declared for `sizeOf` and never assigned. */
	declare readonly '~layout': { readonly size: 16; readonly alignment: 16 };

	/** The value, taken apart and normalised. */
	readonly #parts: DecimalParts;

	/**
	 * Wraps parts that are already normalised. Private, because every value
	 * enters through {@link Decimal.from}, which is where it is checked.
	 *
	 * @param parts The value.
	 */
	private constructor(parts: DecimalParts) {
		this.#parts = parts;
	}

	/**
	 * The largest finite decimal128 value: thirty-four nines, the last at
	 * 10^6111 — 9.999999999999999999999999999999999 × 10^6144.
	 */
	static readonly maximum: Decimal = new Decimal({
		kind: 'finite',
		negative: false,
		coefficient: powerOfTen(PRECISION) - 1n,
		exponent: MAXIMUM_ADJUSTED_EXPONENT - PRECISION + 1,
	});

	/**
	 * The smallest finite value, the negation of {@link Decimal.maximum}. Not the
	 * smallest positive one, which is 1 × 10^-6176.
	 */
	static readonly minimum: Decimal = Decimal.maximum.negate();

	/**
	 * Converts a value into a decimal.
	 *
	 * - A **string** is parsed as a decimal literal — `'-12.5'`, `'1e-3'`,
	 *   `'NaN'`, `'Infinity'` — and rounded half to even past thirty-four
	 *   digits. Surrounding whitespace and hexadecimal are refused.
	 * - A **number** is converted from the shortest text that reads back as it,
	 *   so `Decimal.from(0.1)` is exactly 0.1, not the binary value closest to
	 *   it.
	 * - A **bigint** is converted exactly, then rounded if it has more than
	 *   thirty-four digits.
	 * - A **Decimal** is returned as is.
	 *
	 * @param value Value to convert.
	 * @returns The decimal.
	 * @throws {SyntaxError} When a string is not a decimal literal.
	 * @throws {TypeError} When the value is of another kind.
	 */
	static from = (value: Decimal | string | number | bigint): Decimal => {
		if (value instanceof Decimal) return value;
		if (typeof value === 'string') return new Decimal(parseDecimal(value));
		if (typeof value === 'bigint') {
			return new Decimal(parseDecimal(value.toString()));
		}

		if (typeof value === 'number') {
			if (Number.isNaN(value)) return new Decimal(NOT_A_NUMBER);
			if (value === Infinity || value === -Infinity) {
				return new Decimal(infinity(value < 0));
			}

			// `String(-0)` is `'0'`, which would lose the sign.
			if (value === 0) return new Decimal(zero(Object.is(value, -0)));

			return new Decimal(parseDecimal(String(value)));
		}

		throw new TypeError(
			`Decimal.from: expected a Decimal, a string, a number or a bigint, received ${typeof value}.`,
		);
	};

	/**
	 * Tells whether a value is a decimal.
	 *
	 * @param value Value to inspect.
	 * @returns `true` for an instance of this class.
	 */
	static is = (value: unknown): value is Decimal => value instanceof Decimal;

	/**
	 * Adds a value.
	 *
	 * @param other Value to add.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The sum.
	 */
	add(other: Decimal, mode: RoundingMode = DEFAULT_MODE): Decimal {
		return new Decimal(
			addParts(
				this.#parts,
				other.#parts,
				requireRoundingMode('Decimal.add', mode),
			),
		);
	}

	/**
	 * Subtracts a value.
	 *
	 * @param other Value to subtract.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The difference.
	 */
	subtract(other: Decimal, mode: RoundingMode = DEFAULT_MODE): Decimal {
		return new Decimal(
			addParts(
				this.#parts,
				other.negate().#parts,
				requireRoundingMode('Decimal.subtract', mode),
			),
		);
	}

	/**
	 * Multiplies by a value.
	 *
	 * @param other Value to multiply by.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The product.
	 */
	multiply(other: Decimal, mode: RoundingMode = DEFAULT_MODE): Decimal {
		return new Decimal(
			multiplyParts(
				this.#parts,
				other.#parts,
				requireRoundingMode('Decimal.multiply', mode),
			),
		);
	}

	/**
	 * Divides by a value.
	 *
	 * @param other Divisor.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The quotient; an infinity for a non-zero value over zero, and
	 * `NaN` for zero over zero.
	 */
	divide(other: Decimal, mode: RoundingMode = DEFAULT_MODE): Decimal {
		return new Decimal(
			divideParts(
				this.#parts,
				other.#parts,
				requireRoundingMode('Decimal.divide', mode),
			),
		);
	}

	/**
	 * The remainder of a division truncated towards zero, with the sign of this
	 * value, as `%` computes it. Always exact.
	 *
	 * @param other Divisor.
	 * @returns The remainder; `NaN` for a zero divisor or an infinite dividend.
	 */
	remainder(other: Decimal): Decimal {
		return new Decimal(remainderParts(this.#parts, other.#parts));
	}

	/**
	 * Raises this value to an integer power, rounded once — the correctly
	 * rounded power whenever the exact one has up to 200,000 digits, which
	 * covers every base not within a hair of one.
	 *
	 * ```ts
	 * Decimal.from('1.1').power(Decimal.from(2)).toString(); // '1.21'
	 * Decimal.from('2').power(Decimal.from(-2)).toString(); // '0.25'
	 * ```
	 *
	 * Anything to the power zero is one, `NaN` included, as IEEE 754's `pown`
	 * has it.
	 *
	 * @param exponent Integer exponent, of any sign.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The power.
	 * @throws {RangeError} When the exponent has a fractional part, or is not
	 * finite.
	 */
	power(exponent: Decimal, mode: RoundingMode = DEFAULT_MODE): Decimal {
		const { kind, negative, coefficient, exponent: scale } = exponent.#parts;

		if (kind !== 'finite' || scale < 0) {
			throw new RangeError(
				`Decimal.power: expected an integer exponent, received ${exponent.toString()}.`,
			);
		}

		const power: bigint =
			(negative ? -coefficient : coefficient) * powerOfTen(scale);

		return new Decimal(
			powerParts(
				this.#parts,
				power,
				requireRoundingMode('Decimal.power', mode),
			),
		);
	}

	/**
	 * The value with its sign flipped.
	 *
	 * @returns The negated value.
	 */
	negate(): Decimal {
		if (this.#parts.kind === 'nan') return this;

		return new Decimal({ ...this.#parts, negative: !this.#parts.negative });
	}

	/**
	 * The value without its sign.
	 *
	 * @returns The absolute value.
	 */
	absolute(): Decimal {
		if (!this.#parts.negative) return this;

		return new Decimal({ ...this.#parts, negative: false });
	}

	/**
	 * Rounds to a number of places after the point.
	 *
	 * ```ts
	 * Decimal.from('2.345').round(2).toString(); // '2.34', half to even
	 * Decimal.from('2.345').round(2, 'halfAwayFromZero').toString(); // '2.35'
	 * Decimal.from('1250').round(-2).toString(); // '1200'
	 * ```
	 *
	 * @param places Places after the point, zero by default; negative rounds to
	 * tens, hundreds and so on.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The rounded value.
	 * @throws {RangeError} When `places` is not an integer.
	 */
	round(places: number = 0, mode: RoundingMode = DEFAULT_MODE): Decimal {
		if (!Number.isSafeInteger(places)) {
			throw new RangeError(
				`Decimal.round: expected an integer number of places, received ${places}.`,
			);
		}

		return new Decimal(
			roundParts(
				this.#parts,
				places,
				requireRoundingMode('Decimal.round', mode),
			),
		);
	}

	/**
	 * Compares with a value.
	 *
	 * @param other Value to compare with.
	 * @returns -1 when this value is smaller, 1 when it is larger, 0 when they
	 * are equal — `0` and `-0` included — and `undefined` when either is `NaN`.
	 */
	compare(other: Decimal): -1 | 0 | 1 | undefined {
		return compareParts(this.#parts, other.#parts);
	}

	/**
	 * Tells whether two values are equal. `NaN` equals nothing, itself
	 * included; `0` equals `-0`.
	 *
	 * @param other Value to compare with.
	 * @returns `true` when they are equal.
	 */
	equals(other: Decimal): boolean {
		return this.compare(other) === 0;
	}

	/**
	 * @param other Value to compare with.
	 * @returns `true` when this value is smaller; `false` when either is `NaN`.
	 */
	lessThan(other: Decimal): boolean {
		return this.compare(other) === -1;
	}

	/**
	 * @param other Value to compare with.
	 * @returns `true` when this value is smaller or equal; `false` when either
	 * is `NaN`.
	 */
	lessThanOrEqual(other: Decimal): boolean {
		const order: -1 | 0 | 1 | undefined = this.compare(other);

		return order === -1 || order === 0;
	}

	/**
	 * @param other Value to compare with.
	 * @returns `true` when this value is larger; `false` when either is `NaN`.
	 */
	greaterThan(other: Decimal): boolean {
		return this.compare(other) === 1;
	}

	/**
	 * @param other Value to compare with.
	 * @returns `true` when this value is larger or equal; `false` when either
	 * is `NaN`.
	 */
	greaterThanOrEqual(other: Decimal): boolean {
		const order: -1 | 0 | 1 | undefined = this.compare(other);

		return order === 1 || order === 0;
	}

	/** @returns `true` when the value is `NaN`. */
	isNaN(): boolean {
		return this.#parts.kind === 'nan';
	}

	/** @returns `true` when the value is neither an infinity nor `NaN`. */
	isFinite(): boolean {
		return this.#parts.kind === 'finite';
	}

	/** @returns `true` for `0` and `-0`. */
	isZero(): boolean {
		return isZero(this.#parts);
	}

	/**
	 * Reads the sign bit, which is set for `-0` and `-Infinity` as well as for
	 * negative values — the one way to tell `-0` from `0`.
	 *
	 * @returns `true` when the sign bit is set; `false` for `NaN`.
	 */
	isNegative(): boolean {
		return this.#parts.negative;
	}

	/**
	 * The shortest text that reads back as this value, in plain notation from
	 * 10^-6 to 10^21 and exponential outside it, as `Number` prints.
	 *
	 * @returns The text.
	 */
	toString(): string {
		return formatDecimal(this.#parts);
	}

	/**
	 * The value with a fixed number of digits after the point, in plain
	 * notation.
	 *
	 * @param fractionDigits Digits after the point, from 0 to 100; 0 by default.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The text.
	 * @throws {RangeError} When `fractionDigits` is out of range.
	 */
	toFixed(
		fractionDigits: number = 0,
		mode: RoundingMode = DEFAULT_MODE,
	): string {
		return formatFixed(
			this.#parts,
			requireDigits('toFixed', fractionDigits, 0),
			requireRoundingMode('Decimal.toFixed', mode),
		);
	}

	/**
	 * The value with a number of significant digits.
	 *
	 * @param precision Significant digits, from 1 to 100.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The text, exponential when the exponent is below -6 or at least
	 * the precision, as `Number.prototype.toPrecision` does.
	 * @throws {RangeError} When `precision` is out of range.
	 */
	toPrecision(precision: number, mode: RoundingMode = DEFAULT_MODE): string {
		return formatPrecision(
			this.#parts,
			requireDigits('toPrecision', precision, 1),
			requireRoundingMode('Decimal.toPrecision', mode),
		);
	}

	/**
	 * The value in exponential notation.
	 *
	 * @param fractionDigits Digits after the point, from 0 to 100, or as many
	 * as the value has when omitted.
	 * @param mode Rounding mode, half to even by default.
	 * @returns The text.
	 * @throws {RangeError} When `fractionDigits` is out of range.
	 */
	toExponential(
		fractionDigits?: number,
		mode: RoundingMode = DEFAULT_MODE,
	): string {
		return formatExponential(
			this.#parts,
			fractionDigits === undefined
				? undefined
				: requireDigits('toExponential', fractionDigits, 0),
			requireRoundingMode('Decimal.toExponential', mode),
		);
	}

	/**
	 * The value formatted for a locale, by `Intl.NumberFormat`, which formats
	 * the decimal text itself rather than a `number` converted from it — so no
	 * digit is lost on the way.
	 *
	 * @param locales Locale or locales, as `Intl.NumberFormat` takes them.
	 * @param options Formatting options, as `Intl.NumberFormat` takes them.
	 * @returns The formatted text.
	 */
	toLocaleString(
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions,
	): string {
		return new Intl.NumberFormat(locales, options).format(
			this.toString() as Intl.StringNumericLiteral,
		);
	}

	/**
	 * The text of the value, so that `JSON.stringify` writes it as a string
	 * rather than as `{}`, and without the digits a JSON number would lose.
	 *
	 * @returns The same text as {@link Decimal.toString}.
	 */
	toJSON(): string {
		return this.toString();
	}

	/**
	 * The nearest `number`, rounded once, from the decimal text.
	 *
	 * @returns The number; `NaN` and the infinities convert to their own.
	 */
	toNumber(): number {
		return Number(this.toString());
	}

	/**
	 * The value as a `bigint`, exactly.
	 *
	 * @returns The integer.
	 * @throws {RangeError} When the value has a fractional part, or is not
	 * finite.
	 */
	toBigInt(): bigint {
		const { kind, negative, coefficient, exponent } = this.#parts;

		if (kind !== 'finite' || exponent < 0) {
			throw new RangeError(
				`Decimal.toBigInt: expected an integer, received ${this.toString()}.`,
			);
		}

		const magnitude: bigint = coefficient * powerOfTen(exponent);

		return negative ? -magnitude : magnitude;
	}

	/**
	 * Refuses the implicit conversion every operator performs.
	 *
	 * @returns Never.
	 * @throws {TypeError} Always.
	 */
	valueOf(): never {
		throw new TypeError(
			'Decimal cannot be converted to a primitive implicitly: operators such as + and < would lose its digits. ' +
				'Use add(), compare() or toString() instead.',
		);
	}
}
