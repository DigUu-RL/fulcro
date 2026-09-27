import { describe, expect, it } from 'vitest';

import { none, type Option, optionOf, some } from '@/option';

/**
 * Performance suite.
 *
 * A present value costs one object and an absent one costs nothing: every
 * `none()` is the same frozen object, so absence never allocates. The methods
 * are inherited from a prototype each variant shares, and handling an option
 * runs one branch. All of it is asserted by counting — instances seen,
 * prototypes seen, branches run.
 */

/** How many options each assertion builds. */
const OPTIONS = 10_000;

/** Options alternating between present and absent, through `optionOf`. */
const mixed = (): Option<number>[] =>
	[...Array(OPTIONS).keys()].map((index) =>
		optionOf(index % 2 === 0 ? index : null),
	);

describe('Option', () => {
	it('should allocate nothing for an absent value', () => {
		const absent = new Set<unknown>();

		for (let call = 0; call < OPTIONS; call++) {
			absent.add(none());
			absent.add(optionOf(null));
			absent.add(optionOf(undefined));
		}

		expect(absent.size).toBe(1);
	});

	it('should share one prototype per variant, however many options exist', () => {
		const prototypes = new Set(
			[...mixed(), some(null)].map(
				(option) => Object.getPrototypeOf(option) as object,
			),
		);

		expect(prototypes.size).toBe(2);
	});

	it('should carry one own property, and no methods', () => {
		const counts = new Set(
			mixed().map((option) => Reflect.ownKeys(option).length),
		);

		expect([...counts]).toEqual([1]);
	});

	it('should run exactly one branch per handled option', () => {
		let present = 0;
		let absent = 0;

		for (const option of mixed()) {
			option.handle({
				some: () => present++,
				none: () => absent++,
			});
		}

		expect(present).toBe(OPTIONS / 2);
		expect(absent).toBe(OPTIONS / 2);
	});

	it('should handle a hundred thousand options within budget', () => {
		// A smoke ceiling against a change of complexity class, not a
		// measurement.
		const options = mixed();
		const started: number = performance.now();

		for (let round = 0; round < 10; round++) {
			for (const option of options) {
				option.handle({ some: (value) => value, none: () => 0 });
			}
		}

		expect(performance.now() - started).toBeLessThan(1_000);
	});
});
