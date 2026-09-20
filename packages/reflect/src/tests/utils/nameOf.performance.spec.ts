import { describe, expect, it } from 'vitest';

import { nameOf } from '@/functions/utils/nameOf';

/**
 * Performance suite for `nameOf`.
 *
 * It has two costs that have to be kept apart: what survives into the emitted
 * code when the transformer resolved a call, and what the runtime fallback
 * costs when it did not.
 *
 * This suite runs *with* the transformer, since the harness applies it, which
 * is the shape a consumer who wired it up will see.
 */

/** How many calls the wall clock ceilings make. */
const CALLS = 100_000;

/** Shape whose name is already on the constructor, needing no parsing. */
class Admin {
	email = 'a@b.c';
	roles = ['admin'];
}

/**
 * Times a loop of calls.
 *
 * Returned rather than asserted on directly: absolute budgets are what make a
 * performance suite fail on a loaded runner having found nothing, and every
 * timing assertion below is therefore a comparison against a baseline measured
 * on the same machine, in the same run.
 *
 * @param work Work to repeat.
 * @returns How long the loop took, with a floor so a ratio never divides by
 * something indistinguishable from zero.
 */
const timed = (work: () => void): number => {
	const started: number = performance.now();

	for (let call = 0; call < CALLS; call++) work();

	return Math.max(performance.now() - started, 1);
};

describe('what the transformer leaves behind', () => {
	it('should reduce a resolvable nameOf to a string', () => {
		const user = { email: 'a@b.c' };

		const resolved: number = timed(() => {
			if (nameOf(() => user.email) !== 'email') throw new Error('not resolved');
		});

		const baseline: number = timed(() => {
			if ('email' !== 'email') throw new Error('impossible');
		});

		// Parsing the closure's source a hundred thousand times would be orders
		// of magnitude past this, not a small multiple of it.
		expect(resolved).toBeLessThan(baseline * 25);
	});
});

describe('the fallback', () => {
	it('should name a class from the value it carries', () => {
		// The form that needs no parsing, and therefore no transformer, to be
		// cheap: the name is already on the constructor, and the baseline is
		// reading it directly.
		const resolved: number = timed(() => {
			if (nameOf(Admin) !== 'Admin') throw new Error('not named');
		});

		const baseline: number = timed(() => {
			if (Admin.name !== 'Admin') throw new Error('impossible');
		});

		expect(resolved).toBeLessThan(baseline * 25);
	});

	it('should not evaluate the accessor it is given', () => {
		// The name comes from the source of the closure, so the work behind it
		// never runs — which matters when the property is expensive or throws.
		let evaluated = 0;

		const source = {
			get value(): number {
				evaluated++;
				return 1;
			},
		};

		nameOf(() => source.value);

		expect(evaluated).toBe(0);
	});
});
