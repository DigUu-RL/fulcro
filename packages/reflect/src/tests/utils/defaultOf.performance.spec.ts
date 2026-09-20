import { describe, expect, it } from 'vitest';

import { defaultOf } from '@/functions/utils/defaultOf';

/**
 * Performance suite for `defaultOf`.
 *
 * It is resolved by the transformer, so what a consumer pays at runtime is not
 * what the source looks like — the assertion here is about what survives into
 * the emitted code.
 *
 * This suite runs *with* the transformer, since the harness applies it, which
 * is the shape a consumer who wired it up will see.
 */

/** How many calls the wall clock ceilings make. */
const CALLS = 100_000;

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
	it('should reduce defaultOf to a literal, costing what a literal costs', () => {
		// Resolved at compile time, so the loop below calls no function of this
		// library at all — it allocates an object literal, and the baseline is
		// that same literal written by hand.
		const resolved: number = timed(() => {
			const value: { id: number; name: string } = defaultOf<{
				id: number;
				name: string;
			}>();

			if (value.id !== 0) throw new Error('not a literal');
		});

		const baseline: number = timed(() => {
			const value = { id: 0, name: '' };

			if (value.id !== 0) throw new Error('not a literal');
		});

		// Anything beyond a small multiple means a function is being called
		// where a literal should be, which is to say the transformer did not run.
		expect(resolved).toBeLessThan(baseline * 10);
	});
});
