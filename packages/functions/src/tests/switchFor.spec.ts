import { describe, expect, it } from 'vitest';

import { switchFor } from '@/switchFor';

/** Numeric enum, whose first member is `0` — a falsy key. */
enum Status {
	Draft,
	Published,
	Archived,
}

/** String enum, whose values differ from the member names. */
enum Level {
	Low = 'LOW',
	High = 'HIGH',
}

describe('switchFor, exhaustive form', () => {
	it('should dispatch on each member of a numeric enum', () => {
		const label = (status: Status): string =>
			switchFor(status, {
				[Status.Draft]: () => 'draft',
				[Status.Published]: () => 'published',
				[Status.Archived]: () => 'archived',
			});

		expect(label(Status.Draft)).toBe('draft');
		expect(label(Status.Published)).toBe('published');
		expect(label(Status.Archived)).toBe('archived');
	});

	it('should dispatch on the member whose value is zero', () => {
		// `Status.Draft` is `0`. An implementation reaching for its branch with
		// a truthiness test would fall straight through this one.
		expect(
			switchFor(Status.Draft as Status, {
				[Status.Draft]: () => 'handled',
				[Status.Published]: () => 'wrong',
				[Status.Archived]: () => 'wrong',
			}),
		).toBe('handled');
	});

	it('should dispatch on a string enum by value rather than by name', () => {
		const level = (value: Level): number =>
			switchFor(value, {
				[Level.Low]: () => 1,
				[Level.High]: () => 2,
			});

		expect(level(Level.Low)).toBe(1);
		expect(level(Level.High)).toBe(2);
	});

	it('should dispatch on a union of string literals', () => {
		const theme = (value: 'dark' | 'light'): string =>
			switchFor(value, {
				dark: () => 'moon',
				light: () => 'sun',
			});

		expect(theme('dark')).toBe('moon');
		expect(theme('light')).toBe('sun');
	});

	it('should hand each branch the member it handles', () => {
		const seen = switchFor(Status.Published as Status, {
			[Status.Draft]: (value) => value,
			[Status.Published]: (value) => value,
			[Status.Archived]: (value) => value,
		});

		expect(seen).toBe(Status.Published);
	});

	it('should only run the branch that handled the value', () => {
		const run: string[] = [];

		switchFor(Status.Archived as Status, {
			[Status.Draft]: () => run.push('draft'),
			[Status.Published]: () => run.push('published'),
			[Status.Archived]: () => run.push('archived'),
		});

		expect(run).toEqual(['archived']);
	});

	it('should return a falsy result as a result', () => {
		expect(
			switchFor(Status.Draft as Status, {
				[Status.Draft]: () => 0,
				[Status.Published]: () => 1,
				[Status.Archived]: () => 2,
			}),
		).toBe(0);
	});
});

describe('switchFor, predicate form', () => {
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

	it('should return undefined when nothing matched and no fallback was given', () => {
		const result: string | undefined = switchFor(5, [
			{ when: (value) => value > 100, then: () => 'large' },
		]);

		expect(result).toBeUndefined();
	});

	it('should still return a match when no fallback was given', () => {
		const result: string | undefined = switchFor(200, [
			{ when: (value) => value > 100, then: () => 'large' },
		]);

		expect(result).toBe('large');
	});

	it('should run for its effects alone', () => {
		const run: string[] = [];

		// No result is read, and none has to be: `R` is inferred as void.
		switchFor(
			10,
			[{ when: (value) => value > 5, then: () => void run.push('big') }],
			() => void run.push('small'),
		);

		expect(run).toEqual(['big']);
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
