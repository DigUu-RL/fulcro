import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/src/collections/sequence';

/** Shape with a key worth selecting on and a payload worth keeping. */
interface Pilot {
	readonly id: number;
	readonly name: string;
	readonly team: string;
}

/** Four pilots across two teams, with one duplicated identifier. */
const pilots: readonly Pilot[] = [
	{ id: 1, name: 'Wedge', team: 'Gold' },
	{ id: 2, name: 'Biggs', team: 'Red' },
	{ id: 1, name: 'Wedge again', team: 'Gold' },
	{ id: 3, name: 'Porkins', team: 'Red' },
];

describe('distinctBy', () => {
	it('should keep one element per distinct key', () => {
		expect(
			SequenceCollection.from(pilots)
				.distinctBy((pilot) => pilot.id)
				.select((pilot) => pilot.name)
				.toArray(),
		).toEqual(['Wedge', 'Biggs', 'Porkins']);
	});

	it('should keep the first element seen for a key', () => {
		// Which is what makes the result follow the order of the source.
		expect(
			SequenceCollection.from(pilots)
				.distinctBy((pilot) => pilot.id)
				.first().name,
		).toBe('Wedge');
	});
});

describe('minBy and maxBy', () => {
	it('should return the element rather than the key', () => {
		// The difference from min and max, and the usual reason to want them.
		expect(SequenceCollection.from(pilots).minBy((pilot) => pilot.id).name).toBe('Wedge');
		expect(SequenceCollection.from(pilots).maxBy((pilot) => pilot.id).name).toBe('Porkins');
	});

	it('should keep the first of several equal keys', () => {
		expect(
			SequenceCollection.from(pilots)
				.where((pilot) => pilot.id === 1)
				.minBy((pilot) => pilot.id).name,
		).toBe('Wedge');
	});

	it('should compare string keys', () => {
		expect(SequenceCollection.from(['pear', 'apple', 'fig']).minBy((word) => word)).toBe('apple');
	});

	it('should compare date keys', () => {
		const dates = [new Date(2000, 0, 2), new Date(2000, 0, 1)];

		expect(SequenceCollection.from(dates).minBy((date) => date)).toBe(dates[1]);
	});

	it.each(['minBy', 'maxBy'] as const)('should throw on empty for %s', (name) => {
		expect(() => SequenceCollection.empty<Pilot>()[name]((pilot) => pilot.id)).toThrow(
			/empty sequence/i,
		);
	});
});

describe('exceptBy', () => {
	it('should drop the elements whose key is excluded', () => {
		expect(
			SequenceCollection.from(pilots)
				.exceptBy([1], (pilot) => pilot.id)
				.select((pilot) => pilot.id)
				.toArray(),
		).toEqual([2, 3]);
	});

	it('should return one element per remaining key', () => {
		expect(
			SequenceCollection.from(pilots)
				.exceptBy([2], (pilot) => pilot.id)
				.count(),
		).toBe(2);
	});
});

describe('unionBy', () => {
	it('should append the elements whose key was not already seen', () => {
		const more: readonly Pilot[] = [
			{ id: 3, name: 'duplicate', team: 'Red' },
			{ id: 4, name: 'dee', team: 'Gold' },
		];

		expect(
			SequenceCollection.from(pilots)
				.unionBy(more, (pilot) => pilot.id)
				.select((pilot) => pilot.id)
				.toArray(),
		).toEqual([1, 2, 3, 4]);
	});
});

describe('intersectBy', () => {
	it('should keep only the elements whose key is wanted', () => {
		expect(
			SequenceCollection.from(pilots)
				.intersectBy([1, 3], (pilot) => pilot.id)
				.select((pilot) => pilot.name)
				.toArray(),
		).toEqual(['Wedge', 'Porkins']);
	});
});

describe('countBy', () => {
	it('should count the elements sharing each key', () => {
		expect([...SequenceCollection.from(pilots).countBy((pilot) => pilot.team)]).toEqual([
			['Gold', 2],
			['Red', 2],
		]);
	});

	it('should keep the keys in first-seen order', () => {
		expect([...SequenceCollection.from(['b', 'a', 'b']).countBy((letter) => letter)]).toEqual([
			['b', 2],
			['a', 1],
		]);
	});

	it('should return an empty map for an empty sequence', () => {
		expect(SequenceCollection.empty<Pilot>().countBy((pilot) => pilot.id).size).toBe(0);
	});
});

describe('groupJoin', () => {
	/** Teams the pilots above belong to, plus one nobody is in. */
	const teams = ['Gold', 'Red', 'Green'];

	it('should hand each element its matching group', () => {
		const result = SequenceCollection.from(teams)
			.groupJoin(
				pilots,
				(team) => team,
				(pilot) => pilot.team,
				(team, members) => `${team}:${String(members.count())}`,
			)
			.toArray();

		expect(result).toEqual(['Gold:2', 'Red:2', 'Green:0']);
	});

	it('should keep an element with no match, unlike join', () => {
		// The difference between a left outer join and the inner one `join`
		// performs.
		const grouped = SequenceCollection.from(teams)
			.groupJoin(
				pilots,
				(team) => team,
				(pilot) => pilot.team,
				(team) => team,
			)
			.toArray();

		const joined = SequenceCollection.from(teams)
			.join(
				pilots,
				(team) => team,
				(pilot) => pilot.team,
				(team) => team,
			)
			.distinct()
			.toArray();

		expect(grouped).toContain('Green');
		expect(joined).not.toContain('Green');
	});

	it('should produce one result per element of this sequence', () => {
		expect(
			SequenceCollection.from(teams)
				.groupJoin(
					pilots,
					(team) => team,
					(pilot) => pilot.team,
					(team) => team,
				)
				.count(),
		).toBe(3);
	});
});

describe('toLookup', () => {
	it('should collect every element sharing a key', () => {
		const lookup = SequenceCollection.from(pilots).toLookup((pilot) => pilot.team);

		expect(lookup.get('Gold')?.map((pilot) => pilot.name)).toEqual(['Wedge', 'Wedge again']);
		expect(lookup.get('Red')).toHaveLength(2);
	});

	it('should apply the element projection when given one', () => {
		const lookup = SequenceCollection.from(pilots).toLookup(
			(pilot) => pilot.team,
			(pilot) => pilot.name,
		);

		expect(lookup.get('Red')).toEqual(['Biggs', 'Porkins']);
	});

	it('should collect a duplicate key rather than reject it, unlike toMap', () => {
		expect(
			SequenceCollection.from(pilots)
				.toLookup((pilot) => pilot.id)
				.get(1),
		).toHaveLength(2);

		expect(() => SequenceCollection.from(pilots).toMap((pilot) => pilot.id)).toThrow();
	});
});

describe('toSet', () => {
	it('should discard duplicates', () => {
		expect([...SequenceCollection.from([1, 2, 2, 3]).toSet()]).toEqual([1, 2, 3]);
	});

	it('should return an independent set', () => {
		const sequence = SequenceCollection.from([1, 2]);
		const set = sequence.toSet();

		set.add(9);

		expect(sequence.toArray()).toEqual([1, 2]);
	});
});

describe('range', () => {
	it('should produce consecutive integers', () => {
		expect(SequenceCollection.range(3, 4).toArray()).toEqual([3, 4, 5, 6]);
	});

	it('should produce nothing for a count of zero', () => {
		expect(SequenceCollection.range(0, 0).toArray()).toEqual([]);
	});

	it('should count without generating', () => {
		// A million costs nothing until something reads it.
		expect(SequenceCollection.range(0, 1_000_000).count()).toBe(1_000_000);
	});

	it('should start from a negative value', () => {
		expect(SequenceCollection.range(-2, 3).toArray()).toEqual([-2, -1, 0]);
	});

	it.each([
		[0, -1],
		[1.5, 2],
		[0, 2.5],
	])('should reject range(%s, %s)', (start, count) => {
		expect(() => SequenceCollection.range(start, count)).toThrow();
	});
});

describe('repeat', () => {
	it('should yield the value the given number of times', () => {
		expect(SequenceCollection.repeat('x', 3).toArray()).toEqual(['x', 'x', 'x']);
	});

	it('should produce nothing for a count of zero', () => {
		expect(SequenceCollection.repeat('x', 0).toArray()).toEqual([]);
	});

	it('should count without generating', () => {
		expect(SequenceCollection.repeat(0, 1_000_000).count()).toBe(1_000_000);
	});

	it.each([-1, 1.5])('should reject a count of %s', (count) => {
		expect(() => SequenceCollection.repeat('x', count)).toThrow();
	});
});
