import { describe, expect, expectTypeOf, it } from 'vitest';

import { Decimal } from '@/decimal';
import type { RoundingMode } from '@/roundingMode';

/**
 * Behaviour suite for `Decimal`.
 *
 * Two kinds of evidence. Hand-written vectors pin the edges — the ties, the
 * overflow, the subnormals, the signed zeros, each special value — where the
 * expected text can be checked by reading it. And property checks run a few
 * thousand generated operands through an exact reference written here, on
 * `bigint`, without anything from the implementation: the reference aligns
 * operands by multiplying them out in full, which is exactly the cost the
 * implementation avoids, and so is the independent answer to compare it with.
 */

const D = Decimal.from;

/** Every rounding mode, for the checks that run under each. */
const MODES: readonly RoundingMode[] = [
	'ceiling',
	'floor',
	'truncate',
	'halfEven',
	'halfAwayFromZero',
];

/**
 * A small deterministic generator, so a failing case is the same case on every
 * run and every machine.
 *
 * @param seed Starting state.
 * @returns A function yielding numbers in [0, 1).
 */
const generator = (seed: number): (() => number) => {
	let state: number = seed >>> 0;

	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let mixed: number = Math.imul(state ^ (state >>> 15), 1 | state);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;

		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/** An exact decimal, as the reference sees it: (-1)^negative × coefficient × 10^exponent. */
interface Exact {
	readonly negative: boolean;
	readonly coefficient: bigint;
	readonly exponent: number;
}

/**
 * Rounds an exact value to thirty-four significant digits, by reading its
 * decimal text — deliberately a different method from the implementation's.
 *
 * @param value Exact value, finite and within the normal range.
 * @param mode Rounding mode.
 * @returns The rounded value as a literal.
 */
const referenceRound = (value: Exact, mode: RoundingMode): string => {
	const digits: string = value.coefficient.toString();
	const sign: string = value.negative ? '-' : '';

	if (digits.length <= 34) return `${sign}${digits}e${value.exponent}`;

	const kept: bigint = BigInt(digits.slice(0, 34));
	const first: string = digits[34];
	const rest: boolean = /[1-9]/.test(digits.slice(35));
	const inexact: boolean = first !== '0' || rest;

	let up: boolean;

	switch (mode) {
		case 'truncate':
			up = false;
			break;
		case 'ceiling':
			up = inexact && !value.negative;
			break;
		case 'floor':
			up = inexact && value.negative;
			break;
		case 'halfAwayFromZero':
			up = first >= '5';
			break;
		case 'halfEven':
			up = first > '5' || (first === '5' && (rest || kept % 2n === 1n));
			break;
	}

	return `${sign}${up ? kept + 1n : kept}e${value.exponent + digits.length - 34}`;
};

/**
 * Generates an operand of up to thirty-four digits.
 *
 * @param random Source of randomness.
 * @param exponentSpread Range of exponents to draw from, centred on zero.
 * @returns The operand, exact.
 */
const operand = (random: () => number, exponentSpread: number): Exact => {
	const length: number = 1 + Math.floor(random() * 34);
	let digits = '';

	for (let index = 0; index < length; index++) {
		digits += Math.floor(random() * 10);
	}

	// Nines and trailing zeros are where carries and ties live, and a power of
	// ten is where a subtraction borrows into a lower place, so all three are
	// drawn far more often than chance would.
	if (random() < 0.2) digits = '9'.repeat(length);
	if (random() < 0.2) digits = `1${'0'.repeat(length - 1)}`;
	if (random() < 0.2) {
		digits = `${digits.slice(0, Math.max(1, length - 3))}500`.slice(0, length);
	}

	return {
		negative: random() < 0.5,
		coefficient: BigInt(digits) === 0n ? 1n : BigInt(digits),
		exponent: Math.floor((random() - 0.5) * exponentSpread),
	};
};

/**
 * The literal of an exact value.
 *
 * @param value Exact value.
 * @returns Its literal.
 */
const literal = (value: Exact): string =>
	`${value.negative ? '-' : ''}${value.coefficient}e${value.exponent}`;

/**
 * The exact sum of two values, by aligning them in full.
 *
 * @param left First operand.
 * @param right Second operand.
 * @returns The sum, exact.
 */
const exactSum = (left: Exact, right: Exact): Exact => {
	const exponent: number = Math.min(left.exponent, right.exponent);
	const signed = (value: Exact): bigint =>
		(value.negative ? -1n : 1n) *
		value.coefficient *
		10n ** BigInt(value.exponent - exponent);
	const sum: bigint = signed(left) + signed(right);

	return { negative: sum < 0n, coefficient: sum < 0n ? -sum : sum, exponent };
};

describe('Decimal', () => {
	describe('from a string', () => {
		it.each([
			['1.20', '1.2'],
			['-12.5', '-12.5'],
			['.5', '0.5'],
			['5.', '5'],
			['+7', '7'],
			['0001.000', '1'],
			['1e3', '1000'],
			['1E-7', '1e-7'],
			['-0', '-0'],
			['0.000', '0'],
			['NaN', 'NaN'],
			['Infinity', 'Infinity'],
			['+Infinity', 'Infinity'],
			['-Infinity', '-Infinity'],
		])('should read %s as %s', (text, expected) => {
			expect(D(text).toString()).toBe(expected);
		});

		it.each([
			'',
			'.',
			' 1',
			'1 ',
			'0x10',
			'1e',
			'e5',
			'--1',
			'1..2',
			'Infinity1',
			'nan',
			'inf',
			'1_000',
		])('should refuse %j', (text) => {
			expect(() => D(text)).toThrow(SyntaxError);
		});

		it('should shorten a long input in the message', () => {
			expect(() => D(`${'1'.repeat(100)}x`)).toThrow(`"${'1'.repeat(40)}…"`);
		});

		it('should round past thirty-four digits half to even', () => {
			const ones = '1234567890123456789012345678901234';

			expect(D(`${ones}.5`).toString()).toBe(
				'1.234567890123456789012345678901234e+33',
			);
			expect(D(`${ones.slice(0, 33)}5.5`).toString()).toBe(
				'1.234567890123456789012345678901236e+33',
			);
		});

		it('should round a tie buried past many digits by what follows it', () => {
			expect(D(`1.${'0'.repeat(33)}5`).toString()).toBe('1');
			expect(D(`1.${'0'.repeat(33)}5${'0'.repeat(500)}1`).toString()).toBe(
				`1.${'0'.repeat(32)}1`,
			);
		});

		it('should read a hundred thousand digits', () => {
			expect(D(`0.${'3'.repeat(100_000)}`).toString()).toBe(
				`0.${'3'.repeat(34)}`,
			);
		});

		it('should overflow and underflow on the exponent alone', () => {
			expect(D('1e999999999999').toString()).toBe('Infinity');
			expect(D('-1e999999999999').toString()).toBe('-Infinity');
			expect(D('1e-999999999999').toString()).toBe('0');
			expect(D('-1e-999999999999').toString()).toBe('-0');
		});

		it('should hold the limits of decimal128', () => {
			expect(D('9.999999999999999999999999999999999e6144').toString()).toBe(
				'9.999999999999999999999999999999999e+6144',
			);
			expect(D('1e6145').toString()).toBe('Infinity');
			expect(D('1e-6176').toString()).toBe('1e-6176');
			expect(D('1e-6177').toString()).toBe('0');
			expect(D('1.5e-6176').toString()).toBe('2e-6176');
			expect(D('1.23e-6175').toString()).toBe('1.2e-6175');
		});
	});

	describe('from a number, a bigint or a Decimal', () => {
		it('should read a number as its shortest text, not its binary value', () => {
			expect(D(0.1).toString()).toBe('0.1');
			expect(D(1e21).toString()).toBe('1e+21');
			expect(D(5e-324).toString()).toBe('5e-324');
			expect(D(-0).toString()).toBe('-0');
			expect(D(Number.NaN).isNaN()).toBe(true);
			expect(D(-Infinity).toString()).toBe('-Infinity');
		});

		it('should read a bigint exactly, rounding past thirty-four digits', () => {
			expect(D(123n).toString()).toBe('123');
			expect(D(10n ** 40n).toString()).toBe('1e+40');
			expect(D(10n ** 34n + 1n).toString()).toBe('1e+34');
			expect(D(10n ** 34n + 5n).toString()).toBe('1e+34');
			expect(D(10n ** 34n + 15n).toString()).toBe(
				'1.000000000000000000000000000000002e+34',
			);
		});

		it('should return a Decimal as is', () => {
			const value = D('1');

			expect(D(value)).toBe(value);
		});

		it('should refuse any other kind of value', () => {
			expect(() => D(true as unknown as number)).toThrow(
				'Decimal.from: expected a Decimal, a string, a number or a bigint, received boolean.',
			);
		});
	});

	describe('addition and subtraction', () => {
		it('should add decimal fractions exactly', () => {
			expect(D('0.1').add(D('0.2')).equals(D('0.3'))).toBe(true);
			expect(D('19.99').subtract(D('0.99')).toString()).toBe('19');
		});

		it('should round a tie on the thirty-fourth digit by the mode', () => {
			const nines = D('9'.repeat(34));
			const half = D('0.5');

			expect(nines.add(half).toString()).toBe('1e+34');
			expect(nines.add(half, 'truncate').toString()).toBe(
				'9.999999999999999999999999999999999e+33',
			);
			expect(
				D(`${'9'.repeat(33)}8`)
					.add(half)
					.toString(),
			).toBe('9.999999999999999999999999999999998e+33');
			expect(
				D(`${'9'.repeat(33)}8`)
					.add(half, 'halfAwayFromZero')
					.toString(),
			).toBe('9.999999999999999999999999999999999e+33');
		});

		it('should let an operand far below the other decide only the rounding', () => {
			const large = D('1e6000');
			const tiny = D('1e-6000');

			expect(large.add(tiny).toString()).toBe('1e+6000');
			expect(large.add(tiny, 'ceiling').toString()).toBe(
				'1.000000000000000000000000000000001e+6000',
			);
			expect(large.subtract(tiny).toString()).toBe('1e+6000');
			expect(large.subtract(tiny, 'truncate').toString()).toBe(
				'9.999999999999999999999999999999999e+5999',
			);
			expect(large.negate().subtract(tiny, 'floor').toString()).toBe(
				'-1.000000000000000000000000000000001e+6000',
			);
		});

		it('should round correctly across a borrow', () => {
			// Past the borrow the last kept place moves down one: 1 - 7e-36 is
			// 0.99…9 followed by 93, which rounds up to 1 and truncates to 34 nines.
			expect(D('1').subtract(D('7e-36')).toString()).toBe('1');
			expect(D('1').subtract(D('7e-36'), 'truncate').toString()).toBe(
				`0.${'9'.repeat(34)}`,
			);
			expect(D('1').subtract(D('7e-35')).toString()).toBe(
				`0.${'9'.repeat(34)}`,
			);
			expect(D('1').subtract(D('4e-35')).toString()).toBe('1');
		});

		it('should agree with an exact reference, in every mode', () => {
			const random = generator(0x5eed);
			const wrong: string[] = [];

			for (let index = 0; index < 3_000; index++) {
				// Spreads from a few places to a hundred, so both the aligned
				// path and the far-operand path are exercised.
				const spread: number = [4, 40, 80, 200][index % 4];
				const left: Exact = operand(random, spread);
				const right: Exact = operand(random, spread);
				const mode: RoundingMode = MODES[index % MODES.length];
				const sum: Exact = exactSum(left, right);

				if (sum.coefficient === 0n) continue;

				const expected: string = D(referenceRound(sum, mode)).toString();
				const actual: string = D(literal(left))
					.add(D(literal(right)), mode)
					.toString();

				if (actual !== expected) {
					wrong.push(
						`${literal(left)} + ${literal(right)} (${mode}): ${actual} ≠ ${expected}`,
					);
				}
			}

			expect(wrong).toEqual([]);
		});

		it('should give the zeros the signs IEEE 754 gives them', () => {
			expect(D('0').add(D('-0')).toString()).toBe('0');
			expect(D('-0').add(D('-0')).toString()).toBe('-0');
			expect(D('0').add(D('-0'), 'floor').toString()).toBe('-0');
			expect(D('1').subtract(D('1')).toString()).toBe('0');
			expect(D('1').subtract(D('1'), 'floor').toString()).toBe('-0');
		});

		it('should combine the special values as IEEE 754 does', () => {
			expect(D('Infinity').add(D('Infinity')).toString()).toBe('Infinity');
			expect(D('Infinity').subtract(D('Infinity')).isNaN()).toBe(true);
			expect(D('-Infinity').add(D('1e6144')).toString()).toBe('-Infinity');
			expect(D('NaN').add(D('1')).isNaN()).toBe(true);
			expect(D('1').add(D('0')).toString()).toBe('1');
		});

		it('should overflow to infinity, or stop at the largest value in a directed mode', () => {
			const largest = D('9.999999999999999999999999999999999e6144');
			const place = D('1e6111');

			expect(largest.add(place).toString()).toBe('Infinity');
			expect(largest.add(place, 'truncate').toString()).toBe(
				largest.toString(),
			);
			expect(largest.add(place, 'floor').toString()).toBe(largest.toString());
			expect(largest.negate().subtract(place, 'ceiling').toString()).toBe(
				largest.negate().toString(),
			);
		});
	});

	describe('multiplication', () => {
		it('should multiply exactly when the product fits', () => {
			expect(D('19.99').multiply(D('3')).toString()).toBe('59.97');
			expect(D('-1.5').multiply(D('2')).toString()).toBe('-3');
		});

		it('should agree with an exact reference, in every mode', () => {
			const random = generator(0xbead);
			const wrong: string[] = [];

			for (let index = 0; index < 2_000; index++) {
				const left: Exact = operand(random, 60);
				const right: Exact = operand(random, 60);
				const mode: RoundingMode = MODES[index % MODES.length];
				const product: Exact = {
					negative: left.negative !== right.negative,
					coefficient: left.coefficient * right.coefficient,
					exponent: left.exponent + right.exponent,
				};

				const expected: string = D(referenceRound(product, mode)).toString();
				const actual: string = D(literal(left))
					.multiply(D(literal(right)), mode)
					.toString();

				if (actual !== expected) {
					wrong.push(
						`${literal(left)} × ${literal(right)} (${mode}): ${actual} ≠ ${expected}`,
					);
				}
			}

			expect(wrong).toEqual([]);
		});

		it('should overflow and underflow at the ends of the format', () => {
			expect(D('1e6144').multiply(D('10')).toString()).toBe('Infinity');
			expect(D('1e6144').multiply(D('10'), 'truncate').toString()).toBe(
				'9.999999999999999999999999999999999e+6144',
			);
			expect(D('1e-6176').multiply(D('0.1')).toString()).toBe('0');
			expect(D('-1e-6176').multiply(D('0.5')).toString()).toBe('-0');
			expect(D('-1e-6176').multiply(D('0.5'), 'floor').toString()).toBe(
				'-1e-6176',
			);
		});

		it('should combine the special values as IEEE 754 does', () => {
			expect(D('Infinity').multiply(D('0')).isNaN()).toBe(true);
			expect(D('-Infinity').multiply(D('-2')).toString()).toBe('Infinity');
			expect(D('-0').multiply(D('5')).toString()).toBe('-0');
		});
	});

	describe('division', () => {
		it('should divide to thirty-four digits', () => {
			expect(D('1').divide(D('3')).toString()).toBe(`0.${'3'.repeat(34)}`);
			expect(D('2').divide(D('3')).toString()).toBe(`0.${'6'.repeat(33)}7`);
			expect(D('1').divide(D('8')).toString()).toBe('0.125');
			expect(D('1e-6000').divide(D('1e6000')).toString()).toBe('0');
		});

		it('should round an inexact quotient by the mode', () => {
			expect(D('2').divide(D('3'), 'truncate').toString()).toBe(
				`0.${'6'.repeat(34)}`,
			);
			expect(D('2').divide(D('3'), 'floor').toString()).toBe(
				`0.${'6'.repeat(34)}`,
			);
			expect(D('-2').divide(D('3'), 'floor').toString()).toBe(
				`-0.${'6'.repeat(33)}7`,
			);
			expect(D('-2').divide(D('3'), 'ceiling').toString()).toBe(
				`-0.${'6'.repeat(34)}`,
			);
		});

		it('should stay within half a unit of the exact quotient, and truncate below it', () => {
			const random = generator(0xd1ce);
			const wrong: string[] = [];

			for (let index = 0; index < 1_000; index++) {
				const left: Exact = { ...operand(random, 40), negative: false };
				const right: Exact = { ...operand(random, 40), negative: false };

				for (const mode of ['halfEven', 'truncate'] as const) {
					// Always thirty-four digits, so the last one printed is the
					// unit the quotient was rounded to.
					const quotient: string = D(literal(left))
						.divide(D(literal(right)), mode)
						.toExponential(33);
					const [mantissa, power] = quotient.split('e');
					const digits: string = mantissa.replace('.', '');
					const q: Exact = {
						negative: false,
						coefficient: BigInt(digits),
						exponent: Number(power) - (digits.length - 1),
					};

					// Scale everything to integers at a common exponent and
					// compare q × right with left, exactly.
					const base: number = Math.min(
						q.exponent + right.exponent,
						left.exponent,
					);
					const scale = (value: bigint, exponent: number): bigint =>
						value * 10n ** BigInt(exponent - base);
					const product: bigint = scale(
						q.coefficient * right.coefficient,
						q.exponent + right.exponent,
					);
					const target: bigint = scale(left.coefficient, left.exponent);
					const unit: bigint = scale(
						right.coefficient,
						q.exponent + right.exponent,
					);

					const error: bigint =
						product > target ? product - target : target - product;

					const ok: boolean =
						mode === 'halfEven'
							? 2n * error <= unit
							: product <= target && target < product + unit;

					if (!ok) {
						wrong.push(
							`${literal(left)} / ${literal(right)} (${mode}) = ${quotient}`,
						);
					}
				}
			}

			expect(wrong).toEqual([]);
		});

		it('should follow IEEE 754 on a zero or an infinite operand', () => {
			expect(D('1').divide(D('0')).toString()).toBe('Infinity');
			expect(D('-1').divide(D('0')).toString()).toBe('-Infinity');
			expect(D('1').divide(D('-0')).toString()).toBe('-Infinity');
			expect(D('0').divide(D('0')).isNaN()).toBe(true);
			expect(D('0').divide(D('5')).toString()).toBe('0');
			expect(D('-1').divide(D('Infinity')).toString()).toBe('-0');
			expect(D('Infinity').divide(D('-Infinity')).isNaN()).toBe(true);
			expect(D('Infinity').divide(D('-2')).toString()).toBe('-Infinity');
		});
	});

	describe('remainder', () => {
		it.each([
			['-7.5', '2', '-1.5'],
			['7.5', '-2', '1.5'],
			['10', '3', '1'],
			['0.3', '0.1', '0'],
			['-4', '2', '-0'],
			['1e6000', '7', '1'],
			['1e-6000', '3', '1e-6000'],
			['123.456', '0.01', '0.006'],
			['1', 'Infinity', '1'],
			['5', '0', 'NaN'],
			['Infinity', '1', 'NaN'],
			['NaN', '1', 'NaN'],
		])('should give %s %% %s as %s', (left, right, expected) => {
			expect(D(left).remainder(D(right)).toString()).toBe(expected);
		});

		it('should agree with a - trunc(a / b) × b, computed exactly', () => {
			const random = generator(0xfeed);
			const wrong: string[] = [];

			for (let index = 0; index < 1_000; index++) {
				const left: Exact = operand(random, 30);
				const right: Exact = operand(random, 30);
				const base: number = Math.min(left.exponent, right.exponent);
				const a: bigint =
					(left.negative ? -1n : 1n) *
					left.coefficient *
					10n ** BigInt(left.exponent - base);
				const b: bigint =
					(right.negative ? -1n : 1n) *
					right.coefficient *
					10n ** BigInt(right.exponent - base);
				const r: bigint = a % b;

				const expected: string = D(
					`${r < 0n || (r === 0n && left.negative) ? '-' : ''}${r < 0n ? -r : r}e${base}`,
				).toString();
				const actual: string = D(literal(left))
					.remainder(D(literal(right)))
					.toString();

				if (actual !== expected) {
					wrong.push(
						`${literal(left)} % ${literal(right)}: ${actual} ≠ ${expected}`,
					);
				}
			}

			expect(wrong).toEqual([]);
		});
	});

	describe('round', () => {
		it.each([
			['2.345', 2, 'halfEven', '2.34'],
			['2.345', 2, 'halfAwayFromZero', '2.35'],
			['2.355', 2, 'halfEven', '2.36'],
			['1250', -2, 'halfEven', '1200'],
			['1350', -2, 'halfEven', '1400'],
			['-2.5', 0, 'halfEven', '-2'],
			['-2.5', 0, 'ceiling', '-2'],
			['-2.5', 0, 'floor', '-3'],
			['-2.5', 0, 'truncate', '-2'],
			['-2.5', 0, 'halfAwayFromZero', '-3'],
			['-0.4', 0, 'halfEven', '-0'],
			['1e-6000', 2, 'halfEven', '0'],
			['1e-6000', 2, 'ceiling', '0.01'],
			['9.99', 1, 'halfEven', '10'],
			['1.5', 5, 'halfEven', '1.5'],
			['Infinity', 2, 'halfEven', 'Infinity'],
		] as const)(
			'should round %s to %i places, %s, as %s',
			(value, places, mode, expected) => {
				expect(D(value).round(places, mode).toString()).toBe(expected);
			},
		);

		it('should round to an integer, half to even, by default', () => {
			expect(D('2.5').round().toString()).toBe('2');
		});

		it('should refuse places that are not an integer, and an unknown mode', () => {
			expect(() => D('1').round(1.5)).toThrow(RangeError);
			expect(() => D('1').round(2, 'halfUp' as RoundingMode)).toThrow(
				'Decimal.round: expected a rounding mode of ceiling, floor, truncate, halfEven, halfAwayFromZero, received "halfUp".',
			);
			expect(() => D('1').add(D('1'), 'up' as RoundingMode)).toThrow(
				RangeError,
			);
		});
	});

	describe('comparison', () => {
		it('should order values by magnitude and sign', () => {
			expect(D('1').compare(D('2'))).toBe(-1);
			expect(D('-1').compare(D('-2'))).toBe(1);
			expect(D('1.0').compare(D('1'))).toBe(0);
			expect(D('1e-6176').compare(D('0'))).toBe(1);
			expect(D('-1e-6176').compare(D('0'))).toBe(-1);
			expect(D('99').compare(D('1e2'))).toBe(-1);
			expect(D('1.000000000000000000000000000000001').compare(D('1'))).toBe(1);
		});

		it('should treat the zeros as equal and NaN as ordered against nothing', () => {
			expect(D('0').compare(D('-0'))).toBe(0);
			expect(D('0').equals(D('-0'))).toBe(true);
			expect(D('NaN').compare(D('1'))).toBeUndefined();
			expect(D('NaN').equals(D('NaN'))).toBe(false);
			expect(D('NaN').lessThan(D('1'))).toBe(false);
			expect(D('NaN').greaterThanOrEqual(D('1'))).toBe(false);
		});

		it('should place the infinities beyond every finite value', () => {
			expect(
				D('Infinity').greaterThan(
					D('9.999999999999999999999999999999999e6144'),
				),
			).toBe(true);
			expect(
				D('-Infinity').lessThan(D('-9.999999999999999999999999999999999e6144')),
			).toBe(true);
			expect(D('Infinity').equals(D('Infinity'))).toBe(true);
			expect(D('-Infinity').compare(D('Infinity'))).toBe(-1);
		});

		it('should answer each comparison method consistently with compare', () => {
			const values = ['-Infinity', '-1', '-0', '0', '0.5', '1', 'Infinity'].map(
				(text) => D(text),
			);

			for (const left of values) {
				for (const right of values) {
					const order = left.compare(right);

					expect(left.lessThan(right)).toBe(order === -1);
					expect(left.lessThanOrEqual(right)).toBe(order !== 1);
					expect(left.greaterThan(right)).toBe(order === 1);
					expect(left.greaterThanOrEqual(right)).toBe(order !== -1);
					expect(left.equals(right)).toBe(order === 0);
				}
			}
		});
	});

	describe('sign and kind', () => {
		it('should report each kind of value', () => {
			expect(D('NaN').isNaN()).toBe(true);
			expect(D('Infinity').isFinite()).toBe(false);
			expect(D('1').isFinite()).toBe(true);
			expect(D('-0').isZero()).toBe(true);
			expect(D('-0').isNegative()).toBe(true);
			expect(D('0').isNegative()).toBe(false);
			expect(D('-Infinity').isNegative()).toBe(true);
		});

		it('should negate and take the absolute value, zeros included', () => {
			expect(D('1.5').negate().toString()).toBe('-1.5');
			expect(D('0').negate().toString()).toBe('-0');
			expect(D('-0').absolute().toString()).toBe('0');
			expect(D('-Infinity').absolute().toString()).toBe('Infinity');
			expect(D('NaN').negate().isNaN()).toBe(true);
		});
	});

	describe('text', () => {
		it('should switch to exponential notation where Number does', () => {
			expect(D('1e20').toString()).toBe('100000000000000000000');
			expect(D('1e21').toString()).toBe('1e+21');
			expect(D('0.000001').toString()).toBe('0.000001');
			expect(D('0.0000001').toString()).toBe('1e-7');
			expect(D('-1.5e300').toString()).toBe('-1.5e+300');
		});

		it('should print every double the way Number prints it', () => {
			const random = generator(0x7e57);
			const wrong: string[] = [];

			for (let index = 0; index < 5_000; index++) {
				const value: number =
					(random() - 0.5) * 10 ** Math.floor((random() - 0.5) * 60);

				if (D(value).toString() !== String(value)) wrong.push(String(value));
			}

			expect(wrong).toEqual([]);
		});

		it('should match Number for toFixed, toPrecision and toExponential on exact values', () => {
			// Multiples of 1/64 are exact in binary and in decimal, so Number is
			// rounding the same value, and its rule is half away from zero.
			const random = generator(0xf1ed);
			const wrong: string[] = [];

			for (let index = 0; index < 2_000; index++) {
				const value: number = Math.floor((random() - 0.5) * 2 ** 26) / 64;
				const decimal = D(value);
				const digits: number = Math.floor(random() * 8);

				const pairs: readonly [string, string][] = [
					[decimal.toFixed(digits, 'halfAwayFromZero'), value.toFixed(digits)],
					[
						decimal.toPrecision(digits + 1, 'halfAwayFromZero'),
						value.toPrecision(digits + 1),
					],
					[
						decimal.toExponential(digits, 'halfAwayFromZero'),
						value.toExponential(digits),
					],
				];

				for (const [actual, expected] of pairs) {
					if (actual !== expected) {
						wrong.push(`${value}: ${actual} ≠ ${expected}`);
					}
				}
			}

			expect(wrong).toEqual([]);
		});

		it('should format a fixed number of places, half to even by default', () => {
			expect(D('123.456').toFixed(2)).toBe('123.46');
			expect(D('2.5').toFixed()).toBe('2');
			expect(D('1e21').toFixed(2)).toBe('1000000000000000000000.00');
			expect(D('-0.001').toFixed(2)).toBe('-0.00');
			expect(D('-0').toFixed(2)).toBe('0.00');
			expect(D('NaN').toFixed(2)).toBe('NaN');
			expect(() => D('1').toFixed(101)).toThrow(RangeError);
		});

		it('should format significant digits and exponents', () => {
			expect(D('123.456').toPrecision(2)).toBe('1.2e+2');
			expect(D('0.00001234').toPrecision(2)).toBe('0.000012');
			expect(D('0').toPrecision(3)).toBe('0.00');
			expect(D('9.99').toPrecision(2)).toBe('10');
			expect(D('123456').toExponential()).toBe('1.23456e+5');
			expect(D('123456').toExponential(2)).toBe('1.23e+5');
			expect(D('0').toExponential(2)).toBe('0.00e+0');
			expect(D('-Infinity').toExponential(2)).toBe('-Infinity');
			expect(() => D('1').toPrecision(0)).toThrow(RangeError);
		});

		it('should format for a locale without passing through a number', () => {
			expect(D('1234567.891').toLocaleString('pt-BR')).toBe('1.234.567,891');
			expect(
				D('12345678901234567890.12').toLocaleString('en-US', {
					maximumFractionDigits: 2,
				}),
			).toBe('12,345,678,901,234,567,890.12');
		});

		it('should serialise to JSON as a string, and interpolate as its text', () => {
			expect(JSON.stringify({ price: D('19.99') })).toBe('{"price":"19.99"}');
			expect(`${D('1.5')}`).toBe('1.5');
		});
	});

	describe('conversion out', () => {
		it('should convert to the nearest number', () => {
			expect(D('0.1').toNumber()).toBe(0.1);
			expect(D('1e400').toNumber()).toBe(Infinity);
			expect(Object.is(D('-0').toNumber(), -0)).toBe(true);
			expect(D('NaN').toNumber()).toBeNaN();
		});

		it('should convert an integer to a bigint exactly, and refuse anything else', () => {
			expect(D('1e40').toBigInt()).toBe(10n ** 40n);
			expect(D('-12').toBigInt()).toBe(-12n);
			expect(D('-0').toBigInt()).toBe(0n);
			expect(() => D('1.5').toBigInt()).toThrow(
				'Decimal.toBigInt: expected an integer, received 1.5.',
			);
			expect(() => D('Infinity').toBigInt()).toThrow(RangeError);
		});

		it('should refuse every implicit conversion an operator attempts', () => {
			const one = D('1') as unknown as number;

			expect(() => one + 1).toThrow(TypeError);
			expect(() => +one).toThrow(TypeError);
			expect(() => one < 2).toThrow(TypeError);
		});
	});

	describe('power', () => {
		it.each([
			['1.1', '2', '1.21'],
			['2', '-2', '0.25'],
			['3', '-1', `0.${'3'.repeat(34)}`],
			['-2', '3', '-8'],
			['-2', '2', '4'],
			['10', '6145', 'Infinity'],
			['0.1', '6177', '0'],
			[
				'1.000000000000000000000000000000001',
				'100000000',
				'1.0000000000000000000000001',
			],
			['0', '-1', 'Infinity'],
			['-0', '-3', '-Infinity'],
			['-0', '2', '0'],
			['NaN', '0', '1'],
			['Infinity', '-2', '0'],
			['-Infinity', '3', '-Infinity'],
			['1', '1e6000', '1'],
			['-1', '1e6000', '1'],
		])('should raise %s to %s as %s', (base, exponent, expected) => {
			expect(D(base).power(D(exponent)).toString()).toBe(expected);
		});

		it('should refuse an exponent that is not an integer', () => {
			expect(() => D(2).power(D('1.5'))).toThrow(
				'Decimal.power: expected an integer exponent, received 1.5.',
			);
			expect(() => D(2).power(D('Infinity'))).toThrow(RangeError);
			expect(() => D(2).power(D('NaN'))).toThrow(RangeError);
		});

		it('should agree with the exact power, correctly rounded, in every mode', () => {
			const random = generator(0xabba);
			const wrong: string[] = [];

			for (let index = 0; index < 1_500; index++) {
				const base: Exact = operand(random, 20);
				const power: number = Math.floor(random() * 9);
				const mode: RoundingMode = MODES[index % MODES.length];
				const exact: Exact = {
					negative: base.negative && power % 2 === 1,
					coefficient: base.coefficient ** BigInt(power),
					exponent: base.exponent * power,
				};

				const expected: string = D(referenceRound(exact, mode)).toString();
				const actual: string = D(literal(base))
					.power(D(power), mode)
					.toString();

				if (actual !== expected) {
					wrong.push(
						`${literal(base)} ** ${power} (${mode}): ${actual} ≠ ${expected}`,
					);
				}
			}

			expect(wrong).toEqual([]);
		});

		it('should settle an overflow in a directed mode at the largest value', () => {
			expect(D(10).power(D(6145), 'truncate').equals(Decimal.maximum)).toBe(
				true,
			);
			expect(D(-10).power(D(6145), 'ceiling').equals(Decimal.minimum)).toBe(
				true,
			);
		});
	});

	describe('bounds', () => {
		it('should report the largest and smallest finite values', () => {
			expect(Decimal.maximum.toString()).toBe(
				'9.999999999999999999999999999999999e+6144',
			);
			expect(Decimal.minimum.toString()).toBe(
				'-9.999999999999999999999999999999999e+6144',
			);
		});

		it('should overflow one unit past the maximum', () => {
			expect(Decimal.maximum.add(D('1e6111')).toString()).toBe('Infinity');
			expect(Decimal.minimum.subtract(D('1e6111')).toString()).toBe(
				'-Infinity',
			);
		});
	});

	describe('recognition and types', () => {
		it('should recognise its instances and nothing else', () => {
			expect(Decimal.is(D('1'))).toBe(true);
			expect(Decimal.is('1')).toBe(false);
			expect(Decimal.is(1)).toBe(false);
		});

		it('should declare the layout of decimal128, and carry no such property at runtime', () => {
			expectTypeOf<Decimal['~layout']>().toEqualTypeOf<{
				readonly size: 16;
				readonly alignment: 16;
			}>();
			expect('~layout' in D('1')).toBe(false);
		});

		it('should return a Decimal from every operation', () => {
			expectTypeOf(D('1').add(D('2'))).toEqualTypeOf<Decimal>();
			expectTypeOf(D('1').compare(D('2'))).toEqualTypeOf<
				-1 | 0 | 1 | undefined
			>();
		});
	});
});
