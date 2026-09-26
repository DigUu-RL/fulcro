import { createError } from '@fulcro/errors';

import {
	type DecimalParts,
	infinity,
	NOT_A_NUMBER,
	PRECISION,
	zero,
} from './parts';
import { finish } from './round';

/**
 * A decimal literal: an optional sign, digits with at most one point and at
 * least one digit, and an optional exponent. The same grammar as a JavaScript
 * numeric string, less the hexadecimal, octal and binary forms, and without
 * surrounding whitespace.
 */
const DECIMAL_LITERAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/**
 * Exponents beyond this are clamped to it. Any exponent this large already
 * overflows or underflows whatever digits come with it, and clamping keeps the
 * arithmetic on it exact in a `number`.
 */
const EXPONENT_LIMIT = 1_000_000_000;

/**
 * Significant digits kept from the input before the rest is summarised: the
 * format's thirty-four, and one more to decide the rounding. A thirty-sixth
 * digit then stands for everything after, as 1 when any of it is non-zero —
 * which is all a rounding can ask of it.
 */
const KEPT_DIGITS = PRECISION + 1;

/**
 * Describes a rejected input for an error message, without printing a
 * megabyte of it.
 *
 * @param text Input that was rejected.
 * @returns A quoted, shortened copy.
 */
const describeInput = (text: string): string =>
	JSON.stringify(text.length > 40 ? `${text.slice(0, 40)}…` : text);

/**
 * Parses a decimal literal into normalised parts, rounding half to even when it
 * carries more than thirty-four significant digits.
 *
 * Linear in the length of the input. The digits past the thirty-fifth are only
 * scanned for a non-zero one, never converted, because turning a long string
 * into a `bigint` costs more than linear time and the digits would be discarded
 * by the rounding immediately afterwards anyway.
 *
 * @param text Literal to parse.
 * @returns The parts.
 * @throws {SyntaxError} When the text is not a decimal literal.
 */
export const parseDecimal = (text: string): DecimalParts => {
	switch (text) {
		case 'NaN':
			return NOT_A_NUMBER;
		case 'Infinity':
		case '+Infinity':
			return infinity(false);
		case '-Infinity':
			return infinity(true);
	}

	const match: RegExpExecArray | null = DECIMAL_LITERAL.exec(text);
	const [, sign = '', whole = '', fraction = '', exponentText] = match ?? [];

	if (match === null || whole.length + fraction.length === 0) {
		throw createError('FULCRO6023', describeInput(text));
	}

	const negative: boolean = sign === '-';
	const digits: string = whole + fraction;

	let exponent: number =
		exponentText === undefined
			? 0
			: Math.max(
					-EXPONENT_LIMIT,
					Math.min(EXPONENT_LIMIT, Number(exponentText)),
				);

	exponent -= fraction.length;

	const leading: number = digits.search(/[1-9]/);

	if (leading === -1) return zero(negative);

	const significant: string = digits.slice(leading);

	if (significant.length <= KEPT_DIGITS + 1) {
		return finish(negative, BigInt(significant), exponent, 'halfEven');
	}

	const sticky: string = /[1-9]/.test(significant.slice(KEPT_DIGITS))
		? '1'
		: '0';

	return finish(
		negative,
		BigInt(significant.slice(0, KEPT_DIGITS) + sticky),
		exponent + significant.length - (KEPT_DIGITS + 1),
		'halfEven',
	);
};
