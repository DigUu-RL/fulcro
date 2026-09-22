import { describe, expect, it } from 'vitest';

import { DoublePrecisionFloat } from '@/doublePrecisionFloat';

/**
 * Performance suite for `DoublePrecisionFloat`.
 *
 * Its rounding is the identity, so an operation should cost what the operator
 * costs plus a call. The ratio against the bare operator, measured in the same
 * run, is what would move if a conversion crept in.
 */

/** How many operations each timed loop performs. */
const OPERATIONS = 200_000;

/**
 * Times a loop of multiplications.
 *
 * @param multiply Multiplication under measurement.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (multiply: (left: number, right: number) => number): number => {
	let sink = 1;
	const started: number = performance.now();

	for (let index = 0; index < OPERATIONS; index++) {
		sink = multiply(sink, 1.000001);
	}

	const elapsed: number = performance.now() - started;

	if (Number.isNaN(sink)) {
		throw new Error('unreachable: keeps the loop from being elided');
	}

	return Math.max(elapsed, 1);
};

describe('DoublePrecisionFloat', () => {
	it('should cost a small multiple of the bare operator', () => {
		const baseline: number = timed((left, right) => left * right);
		const described: number = timed((left, right) =>
			DoublePrecisionFloat.multiply(
				left as DoublePrecisionFloat,
				right as DoublePrecisionFloat,
			),
		);

		expect(described).toBeLessThan(baseline * 25);
	});
});
