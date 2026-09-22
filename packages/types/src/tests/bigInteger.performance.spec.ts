import { describe, expect, it } from 'vitest';

import { BigInteger } from '@/bigInteger';

/**
 * Performance suite for `BigInteger`.
 *
 * The descriptor adds a divisor check and nothing else, so parsing and
 * arithmetic should scale exactly as `BigInt` does. The suite holds `from` on a
 * long string to a ratio against `BigInt` on the same string — the literal
 * check it adds is one linear scan — and `multiply` to a ratio against the
 * operator, both measured in the same run.
 *
 * Only ratios, because nothing here can be counted: the work is inside
 * `BigInt`, and the descriptor adds no loop of its own to observe.
 */

/**
 * Times a piece of work repeated a number of times.
 *
 * @param times Repetitions.
 * @param work Work under measurement.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (times: number, work: () => unknown): number => {
	const started: number = performance.now();

	for (let index = 0; index < times; index++) work();

	return Math.max(performance.now() - started, 1);
};

describe('BigInteger', () => {
	it('should parse a long literal at a constant multiple of BigInt itself', () => {
		const literal: string = '7'.repeat(20_000);

		const baseline: number = timed(50, () => BigInt(literal));
		const parsed: number = timed(50, () => BigInteger.from(literal));

		// The literal check is a second linear scan of its own, comparable in
		// cost to the parse, so a ratio near two is the design, not a
		// regression. Three was measured to flake under the full workspace; a
		// quadratic check would cross ten by orders of magnitude.
		expect(parsed).toBeLessThan(baseline * 10);
	});

	it('should multiply at the cost of the operator', () => {
		const left: bigint = 3n ** 2_000n;
		const right: bigint = 7n ** 1_500n;

		const baseline: number = timed(20_000, () => left * right);
		const multiplied: number = timed(20_000, () =>
			BigInteger.multiply(left, right),
		);

		expect(multiplied).toBeLessThan(baseline * 3);
	});
});
