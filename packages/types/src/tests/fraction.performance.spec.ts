import { afterEach, describe, expect, it, vi } from 'vitest';

import { BigInteger } from '@/bigInteger';
import { Fraction } from '@/fraction';

/**
 * Performance suite for `Fraction`.
 *
 * What a fraction costs beyond its integer arithmetic is the reduction to
 * lowest terms, and that is Euclid's algorithm: a number of remainders that
 * grows with the number of digits of its operands, never with their size.
 * Consecutive Fibonacci numbers are its worst case, so the suite reduces them
 * and counts the remainders taken; a subtraction-based or trial-division
 * reduction would take astronomically many.
 */

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * The Fibonacci numbers at two consecutive indices.
 *
 * @param index The larger index.
 * @returns F(index − 1) and F(index).
 */
const fibonacci = (index: number): [bigint, bigint] => {
	let previous = 0n;
	let current = 1n;

	for (let step = 1; step < index; step++) {
		[previous, current] = [current, previous + current];
	}

	return [previous, current];
};

describe('Fraction', () => {
	it('should reduce with remainders in proportion to the digits, on its worst case', () => {
		const Exact = Fraction(BigInteger);
		const [smaller, larger] = fibonacci(300);
		const remainder = vi.spyOn(BigInteger, 'remainder');

		Exact.from({ numerator: smaller, denominator: larger });

		// Euclid on F(n−1), F(n) takes n − 1 steps; F(300) has 63 digits.
		expect(remainder.mock.calls.length).toBeLessThanOrEqual(300);
		expect(larger.toString().length).toBe(63);
	});

	it('should grow its cost linearly with the index of the worst case', () => {
		const Exact = Fraction(BigInteger);
		const remainder = vi.spyOn(BigInteger, 'remainder');
		const counts: number[] = [100, 200, 400].map((index) => {
			const [smaller, larger] = fibonacci(index);

			remainder.mockClear();
			Exact.from({ numerator: smaller, denominator: larger });

			return remainder.mock.calls.length;
		});

		expect(counts[1] / counts[0]).toBeCloseTo(2, 0);
		expect(counts[2] / counts[1]).toBeCloseTo(2, 0);
	});

	it('should skip the divisions when the fraction is already in lowest terms', () => {
		const Exact = Fraction(BigInteger);
		const divide = vi.spyOn(BigInteger, 'divide');

		Exact.from({ numerator: 3, denominator: 7 });

		expect(divide).not.toHaveBeenCalled();
	});

	it('should negate, increment and decrement without reducing again', () => {
		const Exact = Fraction(BigInteger);
		const value = Exact.from({ numerator: 3, denominator: 7 });
		const remainder = vi.spyOn(BigInteger, 'remainder');

		Exact.negate(value);
		Exact.increment(value);
		Exact.decrement(value);

		expect(remainder).not.toHaveBeenCalled();
	});
});
