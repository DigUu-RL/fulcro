import { describe, expect, it } from 'vitest';

import { HalfPrecisionFloat } from '@/src/halfPrecisionFloat';
import { countingView } from '@/src/tests/countingView';

/**
 * Performance suite for `HalfPrecisionFloat`.
 *
 * The rounding is written by hand, since Node 22 has no `Math.f16round`, and
 * what it must not do is loop: finding the spacing by stepping through
 * exponents, or the nearest value by walking the table of patterns, would give
 * the same answers at a cost that grows with the magnitude. So the suite
 * compares small and large magnitudes against each other, and the whole
 * conversion against `Math.fround`, the platform's own constant-time rounding
 * to a neighbouring format — both ratios measured in the same run.
 */

/** How many conversions each timed loop performs. */
const CONVERSIONS = 200_000;

/**
 * Times a loop of conversions over a set of inputs.
 *
 * @param inputs Values to cycle through.
 * @param convert Conversion under measurement.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (inputs: readonly number[], convert: (value: number) => number): number => {
	let sink = 0;
	const started: number = performance.now();

	// Cycles through the inputs by iterating them rather than by index, so the
	// timed loop carries no check that an element exists.
	for (let done = 0; done < CONVERSIONS;) {
		for (const input of inputs) {
			if (done++ === CONVERSIONS) break;

			sink += convert(input);
		}
	}

	const elapsed: number = performance.now() - started;

	if (Number.isNaN(sink)) {
		throw new Error('unreachable: keeps the loop from being elided');
	}

	return Math.max(elapsed, 1);
};

/** Inputs spanning the subnormals, the normals and the overflow. */
const INPUTS: readonly number[] = Array.from(
	{ length: 1_000 },
	(_, index) => (index - 500) * 131.071 + 2 ** -20,
);

describe('HalfPrecisionFloat', () => {
	it('should cost the same for a subnormal as for a value near the top of the range', () => {
		const small: readonly number[] = Array.from(
			{ length: 1_000 },
			(_, index) => (index + 1) * 2 ** -24,
		);

		const large: readonly number[] = Array.from({ length: 1_000 }, (_, index) => 60_000 + index);

		const smallCost: number = timed(small, (value) => HalfPrecisionFloat.from(value));
		const largeCost: number = timed(large, (value) => HalfPrecisionFloat.from(value));

		expect(largeCost).toBeLessThan(smallCost * 5);
		expect(smallCost).toBeLessThan(largeCost * 5);
	});

	it('should cost a small multiple of the platform rounding to single precision', () => {
		// Both called through an arrow, so the two sides pay the same call.
		const baseline: number = timed(INPUTS, (value) => Math.fround(value));
		const rounded: number = timed(INPUTS, (value) => HalfPrecisionFloat.from(value));

		expect(rounded).toBeLessThan(baseline * 50);
	});

	it('should touch the bytes once per value read or written', () => {
		const { view, accesses } = countingView(2 * CONVERSIONS);
		const value = HalfPrecisionFloat.from(0.1);

		for (let index = 0; index < CONVERSIONS; index++) {
			HalfPrecisionFloat.write(view, index * 2, value);
		}

		for (let index = 0; index < CONVERSIONS; index++) HalfPrecisionFloat.read(view, index * 2);

		expect(accesses()).toBe(2 * CONVERSIONS);
	});
});
