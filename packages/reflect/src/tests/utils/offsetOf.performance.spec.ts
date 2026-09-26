import { describe, expect, it } from 'vitest';

import { offsetOf } from '@/functions/utils/offsetOf';

/**
 * Performance suite for `offsetOf`.
 *
 * What the transformer leaves behind is a numeric literal, so a resolved call
 * costs nothing — the placing happened once, in the compiler. Two assertions
 * say so. The first is a count: the runtime implementation throws on every
 * invocation, so a hundred thousand calls that all return is a hundred
 * thousand calls none of which reached it. The second is a ratio against the
 * literal itself, measured in the same run.
 */

/** How many calls each loop makes. */
const CALLS = 100_000;

/** Enough fields, of mixed alignments, that placing them is real work. */
interface Row {
	readonly '~layout': {
		readonly size: 32;
		readonly alignment: 8;
		readonly fields: {
			readonly a: { readonly size: 1; readonly alignment: 1 };
			readonly b: { readonly size: 8; readonly alignment: 8 };
			readonly c: { readonly size: 2; readonly alignment: 2 };
			readonly d: { readonly size: 4; readonly alignment: 4 };
			readonly e: { readonly size: 8; readonly alignment: 8 };
			readonly f: { readonly size: 1; readonly alignment: 1 };
			readonly g: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

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

	if (sink !== CALLS * 28) throw new Error('unreachable: every call reads 28');

	return Math.max(elapsed, 1);
};

describe('what the transformer leaves behind', () => {
	it('should never reach the runtime implementation', () => {
		let reached = 0;

		for (let call = 0; call < CALLS; call++) {
			try {
				offsetOf<Row>('f');
			} catch {
				reached++;
			}
		}

		expect(reached).toBe(0);
	});

	it('should cost what the literal costs', () => {
		// b 0, e 8, d 16, g 20, c 24, a 26, f 27 — the last one placed.
		expect(offsetOf<Row>('f')).toBe(27);

		const baseline: number = timed(() => 28);
		const resolved: number = timed(() => offsetOf<Row>('f') + 1);

		expect(resolved).toBeLessThan(baseline * 25);
	});
});
