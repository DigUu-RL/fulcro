import { describe, expect, it } from 'vitest';

import { SinglePrecisionFloat } from '@/singlePrecisionFloat';

/**
 * Performance suite for `SinglePrecisionFloat`.
 *
 * An operation is the double operation and one `Math.fround`, and should cost
 * about that: the suite holds the descriptor's `add` to a ratio against the
 * same two steps written inline, measured in the same run.
 */

/** How many operations each timed loop performs. */
const OPERATIONS = 200_000;

/**
 * Times a loop of additions.
 *
 * @param add Addition under measurement.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (add: (left: number, right: number) => number): number => {
	let sink = 0;
	const started: number = performance.now();

	for (let index = 0; index < OPERATIONS; index++) sink = add(sink, 0.5);

	const elapsed: number = performance.now() - started;

	if (Number.isNaN(sink)) {
		throw new Error('unreachable: keeps the loop from being elided');
	}

	return Math.max(elapsed, 1);
};

describe('SinglePrecisionFloat', () => {
	it('should cost a small multiple of rounding the double operation inline', () => {
		const baseline: number = timed((left, right) => Math.fround(left + right));
		const described: number = timed((left, right) =>
			SinglePrecisionFloat.add(
				left as SinglePrecisionFloat,
				right as SinglePrecisionFloat,
			),
		);

		expect(described).toBeLessThan(baseline * 25);
	});
});
