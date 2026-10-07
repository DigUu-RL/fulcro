import { describe, expect, it } from 'vitest';

import { walkFlow } from '@/transformer/flow';

import { parse, recordingRules } from './recordingRules';

/**
 * Performance suite for `walkFlow`.
 *
 * Counted, never timed (`docs/testing.md`): what is counted is the reads the
 * walk hands to the rules, which is the work it does. A file twice as long is
 * twice the reads. A loop is walked a second time only when its first
 * iteration changed something, so nesting loops that change nothing costs one
 * walk, not one per level doubled.
 */

/**
 * Counts the reads a walk hands to the rules.
 *
 * @param text The source.
 * @returns How many.
 */
const readsIn = (text: string): number => {
	const { rules, recording } = recordingRules();

	walkFlow(parse(text), rules);

	return recording.events.filter((event) => event.startsWith('read ')).length;
};

/** A function with a branch, a loop and a closure in it. */
const UNIT = [
	'function unit(c, x) {',
	'  if (c) { spend(x); } else { x; }',
	'  for (let i = 0; i < c; i++) { x; }',
	'  return () => x;',
	'}',
].join('\n');

describe('walkFlow, counted', () => {
	it('should do twice the work for a file twice as long', () => {
		const once: number = readsIn(Array(200).fill(UNIT).join('\n'));
		const twice: number = readsIn(Array(400).fill(UNIT).join('\n'));

		expect(once).toBeGreaterThan(0);
		expect(twice).toBe(once * 2);
	});

	it('should walk loops that change nothing once, however deeply they nest', () => {
		const depth = 12;
		const nested: string =
			'for (const a of as) {'.repeat(depth) + 'x;' + '}'.repeat(depth);

		// One read of `as` per loop, and one of `x`.
		expect(readsIn(nested)).toBe(depth + 1);
	});

	it('should walk a loop that changes something exactly twice', () => {
		expect(readsIn('while (c) { x; spend(x); }')).toBe(
			2 * readsIn('c; x; spend(x);'),
		);
	});
});
