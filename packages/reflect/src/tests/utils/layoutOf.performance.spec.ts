import { describe, expect, it } from 'vitest';

import { layoutOf } from '@/functions/utils/layoutOf';

/**
 * Performance suite for `layoutOf`.
 *
 * What the transformer leaves behind is a frozen object literal: the fields
 * were placed once, in the compiler, and a call costs building that object and
 * nothing else. Two assertions say so. The first is a count: the runtime
 * implementation throws on every invocation, so a hundred thousand calls that
 * all return is a hundred thousand calls none of which reached it. The second
 * is a ratio against the same object written out by hand, measured in the same
 * run — which is what the call has to cost if no work was left for runtime.
 */

/** How many calls each loop makes. */
const CALLS = 100_000;

interface Pair {
	readonly '~layout': {
		readonly size: 16;
		readonly alignment: 8;
		readonly fields: {
			readonly flag: { readonly size: 1; readonly alignment: 1 };
			readonly weight: { readonly size: 8; readonly alignment: 8 };
		};
	};
}

/**
 * Times a loop.
 *
 * @param work Work to repeat, returning a layout to keep it from being elided.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (work: () => { readonly size: number }): number => {
	let sink = 0;
	const started: number = performance.now();

	for (let call = 0; call < CALLS; call++) sink += work().size;

	const elapsed: number = performance.now() - started;

	if (sink !== CALLS * 16) throw new Error('unreachable: every call reads 16');

	return Math.max(elapsed, 1);
};

describe('what the transformer leaves behind', () => {
	it('should never reach the runtime implementation', () => {
		let reached = 0;

		for (let call = 0; call < CALLS; call++) {
			try {
				layoutOf<Pair>();
			} catch {
				reached++;
			}
		}

		expect(reached).toBe(0);
	});

	it('should cost what the same literal written by hand costs', () => {
		const baseline: number = timed(() =>
			Object.freeze({
				size: 16,
				alignment: 8,
				fields: Object.freeze({
					flag: Object.freeze({ offset: 8, size: 1, alignment: 1 }),
					weight: Object.freeze({ offset: 0, size: 8, alignment: 8 }),
				}),
			}),
		);
		const resolved: number = timed(() => layoutOf<Pair>());

		expect(resolved).toBeLessThan(baseline * 25);
	});
});
