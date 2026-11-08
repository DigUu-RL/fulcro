import { describe, expect, it } from 'vitest';

import { switchFor } from '@/src/switchFor';

/** Numeric enum, whose first member is `0` — a falsy key. */
enum HyperdriveStatus {
	Online,
	Damaged,
	Offline,
}

/** String enum, whose values differ from the member names. */
enum Clearance {
	Restricted = 'RESTRICTED',
	TopSecret = 'TOP_SECRET',
}

describe('switchFor, exhaustive form', () => {
	it('should dispatch on each member of a numeric enum', () => {
		const label = (status: HyperdriveStatus): string => {
			return switchFor(status, {
				[HyperdriveStatus.Online]: () => 'ready to jump',
				[HyperdriveStatus.Damaged]: () => 'jump at your own risk',
				[HyperdriveStatus.Offline]: () => "it's not my fault",
			});
		};

		expect(label(HyperdriveStatus.Online)).toBe('ready to jump');
		expect(label(HyperdriveStatus.Damaged)).toBe('jump at your own risk');
		expect(label(HyperdriveStatus.Offline)).toBe("it's not my fault");
	});

	it('should dispatch on the member whose value is zero', () => {
		// `HyperdriveStatus.Online` is `0`. An implementation reaching for its
		// branch with a truthiness test would fall straight through this one.
		expect(
			switchFor(HyperdriveStatus.Online as HyperdriveStatus, {
				[HyperdriveStatus.Online]: () => 'handled',
				[HyperdriveStatus.Damaged]: () => 'wrong',
				[HyperdriveStatus.Offline]: () => 'wrong',
			}),
		).toBe('handled');
	});

	it('should dispatch on a string enum by value rather than by name', () => {
		const tier = (value: Clearance): number => {
			return switchFor(value, {
				[Clearance.Restricted]: () => 1,
				[Clearance.TopSecret]: () => 2,
			});
		};

		expect(tier(Clearance.Restricted)).toBe(1);
		expect(tier(Clearance.TopSecret)).toBe(2);
	});

	it('should dispatch on a union of string literals', () => {
		const order = (side: 'dark' | 'light'): string => {
			return switchFor(side, {
				dark: () => 'Sith',
				light: () => 'Jedi',
			});
		};

		expect(order('dark')).toBe('Sith');
		expect(order('light')).toBe('Jedi');
	});

	it('should hand each branch the member it handles', () => {
		const seen = switchFor(HyperdriveStatus.Damaged as HyperdriveStatus, {
			[HyperdriveStatus.Online]: (value) => value,
			[HyperdriveStatus.Damaged]: (value) => value,
			[HyperdriveStatus.Offline]: (value) => value,
		});

		expect(seen).toBe(HyperdriveStatus.Damaged);
	});

	it('should only run the branch that handled the value', () => {
		const cockpitLog: string[] = [];

		switchFor(HyperdriveStatus.Offline as HyperdriveStatus, {
			[HyperdriveStatus.Online]: () => cockpitLog.push('punch it'),
			[HyperdriveStatus.Damaged]: () => cockpitLog.push('call Chewie'),
			[HyperdriveStatus.Offline]: () => cockpitLog.push('kick the panel'),
		});

		expect(cockpitLog).toEqual(['kick the panel']);
	});

	it('should return a falsy result as a result', () => {
		expect(
			switchFor(HyperdriveStatus.Online as HyperdriveStatus, {
				[HyperdriveStatus.Online]: () => 0,
				[HyperdriveStatus.Damaged]: () => 1,
				[HyperdriveStatus.Offline]: () => 2,
			}),
		).toBe(0);
	});
});

describe('switchFor, predicate form', () => {
	it('should return the result of the matching branch', () => {
		const reactorTrend: string = switchFor(
			10,
			[
				{ when: (delta) => delta < 0, then: () => 'cooling' },
				{ when: (delta) => delta === 0, then: () => 'stable' },
				{ when: (delta) => delta > 0, then: () => 'overheating' },
			],
			() => 'sensors offline',
		);

		expect(reactorTrend).toBe('overheating');
	});

	it('should return undefined when nothing matched and no fallback was given', () => {
		const threat: string | undefined = switchFor(5, [
			{ when: (turbolasers) => turbolasers > 100, then: () => 'capital ship' },
		]);

		expect(threat).toBeUndefined();
	});

	it('should still return a match when no fallback was given', () => {
		const threat: string | undefined = switchFor(200, [
			{ when: (turbolasers) => turbolasers > 100, then: () => 'capital ship' },
		]);

		expect(threat).toBe('capital ship');
	});

	it('should run for its effects alone', () => {
		const launched: string[] = [];

		// No result is read, and none has to be: `R` is inferred as void.
		switchFor(
			10,
			[
				{
					when: (fighters): boolean => fighters > 5,
					then: (): undefined => void launched.push('squadron'),
				},
			],
			() => void launched.push('patrol'),
		);

		expect(launched).toEqual(['squadron']);
	});

	it('should fall back when no branch matches', () => {
		const threat: string = switchFor(
			5,
			[{ when: (turbolasers) => turbolasers > 100, then: () => 'capital ship' }],
			() => 'unidentified',
		);

		expect(threat).toBe('unidentified');
	});

	it('should fall back on an empty list of branches', () => {
		expect(switchFor(1, [], () => 'unidentified')).toBe('unidentified');
	});

	it('should take the first match when several would apply', () => {
		const leader: string = switchFor(
			10,
			[
				{ when: () => true, then: () => 'Red Leader' },
				{ when: () => true, then: () => 'Red Two' },
			],
			() => 'unidentified',
		);

		expect(leader).toBe('Red Leader');
	});

	it('should stop testing conditions once one matches', () => {
		const tested: string[] = [];

		switchFor(
			10,
			[
				{
					when: (): true => {
						tested.push('Red Leader');
						return true;
					},
					then: (): string => 'matched',
				},
				{
					when: (): true => {
						tested.push('Red Two');
						return true;
					},
					then: (): string => 'unreachable',
				},
			],
			() => 'unidentified',
		);

		expect(tested).toEqual(['Red Leader']);
	});

	it('should only run the branch that matched', () => {
		const run: string[] = [];

		switchFor(
			10,
			[
				{
					when: (turbolasers): boolean => turbolasers > 100,
					// A branch may do work that would be wrong for a value it
					// does not handle, so it must not run unless it matched.
					then: (): string => {
						run.push('unmatched');
						return 'capital ship';
					},
				},
				{
					when: (turbolasers): boolean => turbolasers > 1,
					then: (): string => {
						run.push('matched');
						return 'corvette';
					},
				},
			],
			() => 'unidentified',
		);

		expect(run).toEqual(['matched']);
	});

	it('should pass the value to both the condition and the branch', () => {
		const species: string = switchFor(
			'Ewok',
			[
				{
					when: (name) => name.length === 4,
					then: (name) => name.toUpperCase(),
				},
			],
			() => 'unidentified',
		);

		expect(species).toBe('EWOK');
	});

	it('should treat a falsy result as a result rather than as no match', () => {
		// The branch is chosen by its condition, never by what it produces, so
		// a branch returning 0 or '' must still win over the fallback.
		expect(switchFor(1, [{ when: (): true => true, then: (): number => 0 }], () => -1)).toBe(0);

		expect(
			switchFor(1, [{ when: (): true => true, then: (): string => '' }], () => 'unidentified'),
		).toBe('');
	});
});
