import { describe, expect, it } from 'vitest';

import { sizeOf } from '@/functions/utils/sizeOf';

/**
 * Performance suite for `sizeOf`.
 *
 * What the transformer leaves behind is a numeric literal, so a resolved call
 * costs nothing. Two assertions say so. The first is a count: the runtime
 * implementation throws on every invocation, so a hundred thousand calls that
 * all return is a hundred thousand calls none of which reached it. The second
 * is a ratio against the literal itself, measured in the same run.
 */

/** How many calls each loop makes. */
const CALLS = 100_000;

type Wide = {
	readonly '~layout': { readonly size: 16; readonly alignment: 16 };
};

/**
 * Times a loop.
 *
 * @param work Work to repeat, returning a number to keep it from being elided.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (work: () => number): number => {
	let sink = 0;
	const started: number = performance.now();

	for (let call = 0; call < CALLS; call++) sink += work();

	const elapsed: number = performance.now() - started;

	if (sink !== CALLS * 16) throw new Error('unreachable: every call reads 16');

	return Math.max(elapsed, 1);
};

describe('what the transformer leaves behind', () => {
	it('should never reach the runtime implementation', () => {
		let reached = 0;

		for (let call = 0; call < CALLS; call++) {
			try {
				sizeOf<Wide>();
			} catch {
				reached++;
			}
		}

		expect(reached).toBe(0);
	});

	it('should cost what the literal costs', () => {
		const baseline: number = timed(() => 16);
		const resolved: number = timed(() => sizeOf<Wide>());

		expect(resolved).toBeLessThan(baseline * 25);
	});
});
