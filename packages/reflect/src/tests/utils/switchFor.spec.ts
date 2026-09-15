import { describe, expect, it } from 'vitest';

import { switchFor } from '@/functions/utils/switchFor';

describe('switchFor', () => {
	it('should return the result of the matching branch', () => {
		const result: string = switchFor(
			10,
			[
				{ when: (value) => value < 0, then: () => 'negative' },
				{ when: (value) => value === 0, then: () => 'zero' },
				{ when: (value) => value > 0, then: () => 'positive' },
			],
			() => 'unknown',
		);

		expect(result).toBe('positive');
	});

	it('should fall back when no branch matches', () => {
		const result: string = switchFor(
			5,
			[{ when: (value) => value > 100, then: () => 'large' }],
			() => 'fallback',
		);

		expect(result).toBe('fallback');
	});

	it('should fall back on an empty list of branches', () => {
		expect(switchFor(1, [], () => 'fallback')).toBe('fallback');
	});

	it('should take the first match when several would apply', () => {
		const result: string = switchFor(
			10,
			[
				{ when: () => true, then: () => 'first' },
				{ when: () => true, then: () => 'second' },
			],
			() => 'fallback',
		);

		expect(result).toBe('first');
	});

	it('should stop testing conditions once one matches', () => {
		const tested: string[] = [];

		switchFor(
			10,
			[
				{
					when: () => {
						tested.push('first');
						return true;
					},
					then: () => 'matched',
				},
				{
					when: () => {
						tested.push('second');
						return true;
					},
					then: () => 'unreachable',
				},
			],
			() => 'fallback',
		);

		expect(tested).toEqual(['first']);
	});

	it('should only run the branch that matched', () => {
		const run: string[] = [];

		switchFor(
			10,
			[
				{
					when: (value) => value > 100,
					// A branch may do work that would be wrong for a value it
					// does not handle, so it must not run unless it matched.
					then: () => {
						run.push('unmatched');
						return 'large';
					},
				},
				{
					when: (value) => value > 1,
					then: () => {
						run.push('matched');
						return 'small';
					},
				},
			],
			() => 'fallback',
		);

		expect(run).toEqual(['matched']);
	});

	it('should pass the value to both the condition and the branch', () => {
		const result: string = switchFor(
			'text',
			[
				{
					when: (value) => value.length === 4,
					then: (value) => value.toUpperCase(),
				},
			],
			() => 'fallback',
		);

		expect(result).toBe('TEXT');
	});

	it('should treat a falsy result as a result rather than as no match', () => {
		// The branch is chosen by its condition, never by what it produces, so
		// a branch returning 0 or '' must still win over the fallback.
		expect(switchFor(1, [{ when: () => true, then: () => 0 }], () => -1)).toBe(
			0,
		);
		expect(
			switchFor(1, [{ when: () => true, then: () => '' }], () => 'x'),
		).toBe('');
	});
});
