import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Decimal } from '@/decimal';

/**
 * Performance suite for `Decimal`.
 *
 * The cost a decimal128 implementation can get catastrophically wrong is the
 * size of its intermediates. The exponent spans more than twelve thousand
 * powers of ten, and aligning 10^6000 with 10^-6000 by multiplying one of them
 * out builds a twelve-thousand-digit integer to produce a thirty-four-digit
 * answer — correct, and a hundred times slower than it should be, and every
 * behaviour test passes over it.
 *
 * So the suite measures the intermediates directly. Every operation hands its
 * exact result to the rounding, which measures it by printing it: standing a
 * recorder in front of `BigInt.prototype.toString` and `BigInt` gives the
 * number of digits of the largest integer any operation built or parsed. That
 * is a count, not a time, and it is the same on every machine.
 *
 * Parsing is held to linear time by a scaling ratio measured in the same run,
 * the one place where the clock is the right tool.
 */

/** Digits of the largest integer printed or parsed since the test started. */
let largest = 0;

const nativeToString = BigInt.prototype.toString;
const nativeBigInt: BigIntConstructor = globalThis.BigInt;

beforeEach(() => {
	largest = 0;

	BigInt.prototype.toString = function (
		this: bigint,
		...radix: [number?]
	): string {
		const text: string = nativeToString.apply(this, radix);

		largest = Math.max(largest, text.length);

		return text;
	};

	globalThis.BigInt = new Proxy(nativeBigInt, {
		apply: (target, receiver, argumentsList: unknown[]) => {
			const [value] = argumentsList;

			if (typeof value === 'string') largest = Math.max(largest, value.length);

			return Reflect.apply(target, receiver, argumentsList);
		},
	});
});

afterEach(() => {
	BigInt.prototype.toString = nativeToString;
	globalThis.BigInt = nativeBigInt;
});

const D = Decimal.from;

/**
 * No intermediate may pass this many digits: two thirty-four-digit
 * coefficients aligned across the few dozen places the operations allow, with
 * room to spare. The naive alignment reaches twelve thousand.
 */
const INTERMEDIATE_CEILING = 110;

describe('Decimal intermediates', () => {
	it.each([
		['1e6000', '1e-6000'],
		['9.999999999999999999999999999999999e6144', '1e-6176'],
		['-1e-6176', '1e6144'],
	])(
		'should add %s and %s without writing out the gap between them',
		(left, right) => {
			const a = D(left);
			const b = D(right);

			largest = 0;

			for (const mode of [
				'halfEven',
				'ceiling',
				'floor',
				'truncate',
			] as const) {
				a.add(b, mode);
				a.subtract(b, mode);
				b.subtract(a, mode);
			}

			expect(largest).toBeLessThanOrEqual(INTERMEDIATE_CEILING);
		},
	);

	it('should multiply and divide across the whole exponent range in bounded digits', () => {
		const huge = D('9.999999999999999999999999999999999e6144');
		const tiny = D('1.234567890123456789012345678901234e-6176');

		largest = 0;

		huge.multiply(tiny);
		tiny.multiply(tiny);
		huge.divide(tiny);
		tiny.divide(huge);
		D('1').divide(D('3'));

		expect(largest).toBeLessThanOrEqual(INTERMEDIATE_CEILING);
	});

	it('should find a remainder across twelve thousand places by reducing the power', () => {
		const huge = D('9.999999999999999999999999999999999e6144');
		const tiny = D('7e-6176');

		largest = 0;

		huge.remainder(D('7'));
		huge.remainder(tiny);
		D('1e6000').remainder(D('3.3'));

		expect(largest).toBeLessThanOrEqual(INTERMEDIATE_CEILING);
	});

	it('should compare values of any exponent in bounded digits', () => {
		const values = [
			'1e6144',
			'1e-6176',
			'-5e3000',
			'5.000000000000000000000000000000001e3000',
		].map((text) => D(text));

		largest = 0;

		for (const left of values) for (const right of values) left.compare(right);

		expect(largest).toBeLessThanOrEqual(INTERMEDIATE_CEILING);
	});

	it('should round away six thousand places without building their power', () => {
		largest = 0;

		D('1e-6000').round(2, 'ceiling');
		D('1.5e-6176').round(0);
		D('1e6000').round(-6000);

		expect(largest).toBeLessThanOrEqual(INTERMEDIATE_CEILING);
	});

	it('should parse a hundred thousand digits converting only the ones it keeps', () => {
		const text = `0.${'3'.repeat(100_000)}`;

		largest = 0;
		D(text);

		// Thirty-four digits, the rounding digit and the one summarising the rest.
		expect(largest).toBeLessThanOrEqual(36);
	});

	it('should print an extreme exponent in exponential notation, not in full', () => {
		expect(D('1e6000').toString().length).toBeLessThan(10);
		expect(D('-1.5e-6000').toString().length).toBeLessThan(12);
	});
});

describe('Decimal parsing', () => {
	it('should take time linear in the length of the input', () => {
		/**
		 * Times the parsing of a literal.
		 *
		 * @param length Digits after the point.
		 * @returns Milliseconds for a fixed number of parses, never less than one.
		 */
		const timed = (length: number): number => {
			const text = `0.${'7'.repeat(length)}1`;
			const repetitions: number = 2_000_000 / length;
			const started: number = performance.now();

			for (let index = 0; index < repetitions; index++) D(text);

			return Math.max(performance.now() - started, 1);
		};

		// The same number of digits parsed in total, in short literals and in
		// long ones: linear parsing costs the same either way, and a quadratic
		// one costs ten times more for the long ones.
		const short: number = timed(10_000);
		const long: number = timed(100_000);

		expect(long).toBeLessThan(short * 4);
	});
});
