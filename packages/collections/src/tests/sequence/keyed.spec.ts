import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/** Shape with a key worth selecting on and a payload worth keeping. */
interface User {
	readonly id: number;
	readonly name: string;
	readonly team: string;
}

/** Four users across two teams, with one duplicated identifier. */
const users: readonly User[] = [
	{ id: 1, name: 'ana', team: 'blue' },
	{ id: 2, name: 'bo', team: 'red' },
	{ id: 1, name: 'ana again', team: 'blue' },
	{ id: 3, name: 'cy', team: 'red' },
];

describe('distinctBy', () => {
	it('should keep one element per distinct key', () => {
		expect(
			SequenceCollection.from(users)
				.distinctBy((user) => user.id)
				.select((user) => user.name)
				.toArray(),
		).toEqual(['ana', 'bo', 'cy']);
	});

	it('should keep the first element seen for a key', () => {
		// Which is what makes the result follow the order of the source.
		expect(
			SequenceCollection.from(users)
				.distinctBy((user) => user.id)
				.first().name,
		).toBe('ana');
	});
});

describe('minBy and maxBy', () => {
	it('should return the element rather than the key', () => {
		// The difference from min and max, and the usual reason to want them.
		expect(SequenceCollection.from(users).minBy((user) => user.id).name).toBe(
			'ana',
		);
		expect(SequenceCollection.from(users).maxBy((user) => user.id).name).toBe(
			'cy',
		);
	});

	it('should keep the first of several equal keys', () => {
		expect(
			SequenceCollection.from(users)
				.where((user) => user.id === 1)
				.minBy((user) => user.id).name,
		).toBe('ana');
	});

	it('should compare string keys', () => {
		expect(
			SequenceCollection.from(['pear', 'apple', 'fig']).minBy((word) => word),
		).toBe('apple');
	});

	it('should compare date keys', () => {
		const dates = [new Date(2000, 0, 2), new Date(2000, 0, 1)];

		expect(SequenceCollection.from(dates).minBy((date) => date)).toBe(dates[1]);
	});

	it.each(['minBy', 'maxBy'] as const)(
		'should throw on empty for %s',
		(name) => {
			expect(() =>
				SequenceCollection.empty<User>()[name]((user) => user.id),
			).toThrow(/empty sequence/i);
		},
	);
});

describe('exceptBy', () => {
	it('should drop the elements whose key is excluded', () => {
		expect(
			SequenceCollection.from(users)
				.exceptBy([1], (user) => user.id)
				.select((user) => user.id)
				.toArray(),
		).toEqual([2, 3]);
	});

	it('should return one element per remaining key', () => {
		expect(
			SequenceCollection.from(users)
				.exceptBy([2], (user) => user.id)
				.count(),
		).toBe(2);
	});
});

describe('unionBy', () => {
	it('should append the elements whose key was not already seen', () => {
		const more: readonly User[] = [
			{ id: 3, name: 'duplicate', team: 'red' },
			{ id: 4, name: 'dee', team: 'blue' },
		];

		expect(
			SequenceCollection.from(users)
				.unionBy(more, (user) => user.id)
				.select((user) => user.id)
				.toArray(),
		).toEqual([1, 2, 3, 4]);
	});
});

describe('intersectBy', () => {
	it('should keep only the elements whose key is wanted', () => {
		expect(
			SequenceCollection.from(users)
				.intersectBy([1, 3], (user) => user.id)
				.select((user) => user.name)
				.toArray(),
		).toEqual(['ana', 'cy']);
	});
});

describe('countBy', () => {
	it('should count the elements sharing each key', () => {
		expect([
			...SequenceCollection.from(users).countBy((user) => user.team),
		]).toEqual([
			['blue', 2],
			['red', 2],
		]);
	});

	it('should keep the keys in first-seen order', () => {
		expect([
			...SequenceCollection.from(['b', 'a', 'b']).countBy((letter) => letter),
		]).toEqual([
			['b', 2],
			['a', 1],
		]);
	});

	it('should return an empty map for an empty sequence', () => {
		expect(SequenceCollection.empty<User>().countBy((u) => u.id).size).toBe(0);
	});
});

describe('groupJoin', () => {
	/** Teams the users above belong to, plus one nobody is in. */
	const teams = ['blue', 'red', 'green'];

	it('should hand each element its matching group', () => {
		const result = SequenceCollection.from(teams)
			.groupJoin(
				users,
				(team) => team,
				(user) => user.team,
				(team, members) => `${team}:${members.count()}`,
			)
			.toArray();

		expect(result).toEqual(['blue:2', 'red:2', 'green:0']);
	});

	it('should keep an element with no match, unlike join', () => {
		// The difference between a left outer join and the inner one `join`
		// performs.
		const grouped = SequenceCollection.from(teams)
			.groupJoin(
				users,
				(team) => team,
				(user) => user.team,
				(team) => team,
			)
			.toArray();

		const joined = SequenceCollection.from(teams)
			.join(
				users,
				(team) => team,
				(user) => user.team,
				(team) => team,
			)
			.distinct()
			.toArray();

		expect(grouped).toContain('green');
		expect(joined).not.toContain('green');
	});

	it('should produce one result per element of this sequence', () => {
		expect(
			SequenceCollection.from(teams)
				.groupJoin(
					users,
					(team) => team,
					(user) => user.team,
					(team) => team,
				)
				.count(),
		).toBe(3);
	});
});

describe('toLookup', () => {
	it('should collect every element sharing a key', () => {
		const lookup = SequenceCollection.from(users).toLookup((user) => user.team);

		expect(lookup.get('blue')?.map((user) => user.name)).toEqual([
			'ana',
			'ana again',
		]);
		expect(lookup.get('red')).toHaveLength(2);
	});

	it('should apply the element projection when given one', () => {
		const lookup = SequenceCollection.from(users).toLookup(
			(user) => user.team,
			(user) => user.name,
		);

		expect(lookup.get('red')).toEqual(['bo', 'cy']);
	});

	it('should collect a duplicate key rather than reject it, unlike toMap', () => {
		expect(
			SequenceCollection.from(users)
				.toLookup((u) => u.id)
				.get(1),
		).toHaveLength(2);
		expect(() => SequenceCollection.from(users).toMap((u) => u.id)).toThrow();
	});
});

describe('toSet', () => {
	it('should discard duplicates', () => {
		expect([...SequenceCollection.from([1, 2, 2, 3]).toSet()]).toEqual([
			1, 2, 3,
		]);
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
		expect(SequenceCollection.repeat('x', 3).toArray()).toEqual([
			'x',
			'x',
			'x',
		]);
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
