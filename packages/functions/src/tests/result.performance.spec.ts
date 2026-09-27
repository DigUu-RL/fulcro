import { describe, expect, it } from 'vitest';

import { failure, type Result, success } from '@/result';

/**
 * Performance suite.
 *
 * What a result costs is one object: the methods are inherited from a prototype
 * each variant shares, never copied onto each value, and handling one runs one
 * branch. Both are asserted by counting — prototypes seen, properties carried,
 * branches run — so a change that starts copying methods or evaluating both
 * branches fails by a factor of the input size, not by a few percent.
 */

/** How many results each assertion builds. */
const RESULTS = 10_000;

/** Results alternating between the two variants. */
const mixed = (): Result<number, string>[] =>
	[...Array(RESULTS).keys()].map((index) =>
		index % 2 === 0 ? success(index) : failure(`failed ${index}`),
	);

describe('Result', () => {
	it('should share one prototype per variant, however many results exist', () => {
		const prototypes = new Set(
			mixed().map((result) => Object.getPrototypeOf(result) as object),
		);

		expect(prototypes.size).toBe(2);
	});

	it('should carry two own properties, and no methods', () => {
		const counts = new Set(
			mixed().map((result) => Reflect.ownKeys(result).length),
		);

		expect([...counts]).toEqual([2]);
	});

	it('should run exactly one branch per handled result', () => {
		let successes = 0;
		let failures = 0;

		for (const result of mixed()) {
			result.handle({
				success: () => successes++,
				failure: () => failures++,
			});
		}

		expect(successes).toBe(RESULTS / 2);
		expect(failures).toBe(RESULTS / 2);
	});

	it('should handle a hundred thousand results within budget', () => {
		// A smoke ceiling against a change of complexity class, not a
		// measurement.
		const results = mixed();
		const started: number = performance.now();

		for (let round = 0; round < 10; round++) {
			for (const result of results) {
				result.handle({ success: (value) => value, failure: () => 0 });
			}
		}

		expect(performance.now() - started).toBeLessThan(1_000);
	});
});
