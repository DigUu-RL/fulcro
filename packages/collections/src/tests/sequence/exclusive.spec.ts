import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * A single-pass source, of the kind that silently yields nothing the second
 * time it is read.
 *
 * @param values Elements to yield.
 * @returns The generator.
 */
const once = function* <T>(values: readonly T[]): Generator<T> {
	yield* values;
};

describe('memoize', () => {
	it('should let a generator-backed sequence be read twice', () => {
		// Without it the second pass returns nothing, and does so silently: an
		// exhausted iterator cannot be told from an empty one.
		const spent = SequenceCollection.from(once([1, 2, 3]));

		expect(spent.toArray()).toEqual([1, 2, 3]);
		expect(spent.toArray()).toEqual([]);

		const kept = SequenceCollection.from(once([1, 2, 3])).memoize();

		expect(kept.toArray()).toEqual([1, 2, 3]);
		expect(kept.toArray()).toEqual([1, 2, 3]);
		expect(kept.toArray()).toEqual([1, 2, 3]);
	});

	it('should run the projections of its chain only once', () => {
		let calls = 0;
		const query = SequenceCollection.from([1, 2, 3])
			.select((value) => {
				calls++;
				return value * 2;
			})
			.memoize();

		query.toArray();
		query.toArray();
		query.toArray();

		expect(calls).toBe(3);
	});

	it('should read nothing until something asks', () => {
		let pulled = 0;
		const source = {
			*[Symbol.iterator](): Iterator<number> {
				for (const value of [1, 2, 3]) {
					pulled++;
					yield value;
				}
			},
		};

		const kept = SequenceCollection.from(source).memoize();

		expect(pulled).toBe(0);
		kept.first();
		// Only as far as the element that was wanted.
		expect(pulled).toBe(1);
	});

	it('should pull each element once across interleaved traversals', () => {
		let pulled = 0;
		const source = {
			*[Symbol.iterator](): Iterator<number> {
				for (const value of [1, 2, 3]) {
					pulled++;
					yield value;
				}
			},
		};

		const kept = SequenceCollection.from(source).memoize();
		const left = kept[Symbol.iterator]();
		const right = kept[Symbol.iterator]();

		left.next();
		right.next();
		left.next();
		right.next();

		expect(pulled).toBe(2);
	});

	it('should carry the count of its source', () => {
		expect(SequenceCollection.from([1, 2, 3]).memoize().count()).toBe(3);
	});
});

describe('partition', () => {
	it('should split by the condition, keeping source order', () => {
		const [even, odd] = SequenceCollection.from([1, 2, 3, 4]).partition(
			(value) => value % 2 === 0,
		);

		expect(even.toArray()).toEqual([2, 4]);
		expect(odd.toArray()).toEqual([1, 3]);
	});

	it('should read the source once, so a generator survives it', () => {
		const [matched, rest] = SequenceCollection.from(once([1, 2, 3])).partition(
			(value) => value > 1,
		);

		expect(matched.toArray()).toEqual([2, 3]);
		expect(rest.toArray()).toEqual([1]);
	});

	it('should evaluate the predicate once per element', () => {
		let calls = 0;

		SequenceCollection.from([1, 2, 3, 4]).partition((value) => {
			calls++;
			return value % 2 === 0;
		});

		expect(calls).toBe(4);
	});

	it('should give two empty halves for an empty sequence', () => {
		const [matched, rest] = SequenceCollection.empty<number>().partition(
			() => true,
		);

		expect(matched.toArray()).toEqual([]);
		expect(rest.toArray()).toEqual([]);
	});
});

describe('scan', () => {
	it('should yield every intermediate accumulation', () => {
		expect(
			SequenceCollection.from([1, 2, 3])
				.scan(0, (total, value) => total + value)
				.toArray(),
		).toEqual([1, 3, 6]);
	});

	it('should not emit the seed', () => {
		// One value out per element in, which is what lets it be zipped with the
		// source it came from.
		const source = [1, 2, 3];
		const running = SequenceCollection.from(source).scan(
			0,
			(total, value) => total + value,
		);

		expect(running.count()).toBe(source.length);
	});

	it('should end on the same value aggregate returns', () => {
		const values = [4, 7, 1];
		const sum = (total: number, value: number): number => total + value;

		expect(SequenceCollection.from(values).scan(0, sum).last()).toBe(
			SequenceCollection.from(values).aggregate(0, sum),
		);
	});

	it('should restart from the seed on a second traversal', () => {
		const running = SequenceCollection.from([1, 2]).scan(
			0,
			(total, value) => total + value,
		);

		expect(running.toArray()).toEqual([1, 3]);
		expect(running.toArray()).toEqual([1, 3]);
	});

	it('should produce nothing for an empty sequence', () => {
		expect(
			SequenceCollection.empty<number>()
				.scan(0, (a) => a)
				.toArray(),
		).toEqual([]);
	});
});

describe('windowed', () => {
	it('should yield overlapping runs', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).windowed(2).toArray()).toEqual(
			[
				[1, 2],
				[2, 3],
				[3, 4],
			],
		);
	});

	it('should yield nothing when the sequence is shorter than one window', () => {
		expect(SequenceCollection.from([1, 2]).windowed(3).toArray()).toEqual([]);
	});

	it('should hand out copies rather than the moving window', () => {
		// A consumer holding on to a window must not watch it change.
		const windows = SequenceCollection.from([1, 2, 3]).windowed(2).toArray();

		expect(windows[0]).toEqual([1, 2]);
		expect(windows[1]).toEqual([2, 3]);
	});

	it('should report how many windows a known source yields', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).windowed(2).count()).toBe(3);
		expect(SequenceCollection.from([1, 2]).windowed(5).count()).toBe(0);
	});

	it.each([0, -1, 1.5])('should reject a size of %s', (size) => {
		expect(() => SequenceCollection.from([1, 2]).windowed(size)).toThrow(
			/positive integer/i,
		);
	});
});

describe('pairwise', () => {
	it('should pair each element with its predecessor', () => {
		expect(SequenceCollection.from([1, 2, 3]).pairwise().toArray()).toEqual([
			[1, 2],
			[2, 3],
		]);
	});

	it('should yield nothing for fewer than two elements', () => {
		expect(SequenceCollection.from([1]).pairwise().toArray()).toEqual([]);
		expect(SequenceCollection.empty<number>().pairwise().toArray()).toEqual([]);
	});

	it('should serve the usual case of a delta between readings', () => {
		expect(
			SequenceCollection.from([10, 14, 13])
				.pairwise()
				.select(([previous, current]) => current - previous)
				.toArray(),
		).toEqual([4, -1]);
	});

	it('should pair a nullish element rather than treating it as absent', () => {
		expect(
			SequenceCollection.from([null, 1, null]).pairwise().toArray(),
		).toEqual([
			[null, 1],
			[1, null],
		]);
	});
});

describe('groupAdjacent', () => {
	it('should start a new group whenever the key changes', () => {
		const runs = SequenceCollection.from(['a', 'a', 'b', 'a'])
			.groupAdjacent((letter) => letter)
			.toArray();

		expect(runs.map((run) => [run.key, run.toArray()])).toEqual([
			['a', ['a', 'a']],
			['b', ['b']],
			['a', ['a']],
		]);
	});

	it('should differ from groupBy, which collects a key wherever it appears', () => {
		const source = ['a', 'b', 'a'];

		expect(
			SequenceCollection.from(source)
				.groupAdjacent((letter) => letter)
				.count(),
		).toBe(3);
		expect(
			SequenceCollection.from(source)
				.groupBy((letter) => letter)
				.count(),
		).toBe(2);
	});

	it('should produce nothing for an empty sequence', () => {
		expect(
			SequenceCollection.empty<string>()
				.groupAdjacent((letter) => letter)
				.toArray(),
		).toEqual([]);
	});

	it('should yield groups that chain like any other sequence', () => {
		expect(
			SequenceCollection.from([1, 1, 2])
				.groupAdjacent((value) => value)
				.select((run) => run.count())
				.toArray(),
		).toEqual([2, 1]);
	});
});

describe('median', () => {
	it('should take the middle value of an odd count', () => {
		expect(SequenceCollection.from([3, 1, 2]).median()).toBe(2);
	});

	it('should average the two middle values of an even count', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).median()).toBe(2.5);
	});

	it('should sort numerically rather than lexicographically', () => {
		// The default sort would put 10 before 9 and answer 10.
		expect(SequenceCollection.from([9, 10, 11]).median()).toBe(10);
	});

	it('should apply a selector', () => {
		expect(
			SequenceCollection.from([{ n: 5 }, { n: 1 }, { n: 3 }]).median(
				(v) => v.n,
			),
		).toBe(3);
	});

	it('should throw on an empty sequence', () => {
		expect(() => SequenceCollection.empty<number>().median()).toThrow(/empty/i);
	});
});

describe('percentile', () => {
	it('should agree with median at 50', () => {
		const values = [1, 2, 3, 4];

		expect(SequenceCollection.from(values).percentile(50)).toBe(
			SequenceCollection.from(values).median(),
		);
	});

	it('should return the extremes at 0 and 100', () => {
		expect(SequenceCollection.from([5, 1, 9]).percentile(0)).toBe(1);
		expect(SequenceCollection.from([5, 1, 9]).percentile(100)).toBe(9);
	});

	it('should interpolate between the nearest values', () => {
		// Position 0.5 of [10, 20, 30, 40] lands halfway between 10 and 20.
		expect(
			SequenceCollection.from([10, 20, 30, 40]).percentile(16.6667),
		).toBeCloseTo(15, 3);
	});

	it.each([-1, 101, Number.NaN])('should reject a rank of %s', (rank) => {
		expect(() => SequenceCollection.from([1, 2]).percentile(rank)).toThrow(
			/between 0 and 100/i,
		);
	});
});

describe('standardDeviation', () => {
	it('should measure the population spread', () => {
		// [2, 4, 4, 4, 5, 5, 7, 9] has a mean of 5 and a population sigma of 2.
		expect(
			SequenceCollection.from([2, 4, 4, 4, 5, 5, 7, 9]).standardDeviation(),
		).toBe(2);
	});

	it('should be zero when every value is the same', () => {
		expect(SequenceCollection.from([3, 3, 3]).standardDeviation()).toBe(0);
	});

	it('should differ from the sample form', () => {
		// The whole reason both exist under their own names.
		const values = [2, 4, 4, 4, 5, 5, 7, 9];
		const population = SequenceCollection.from(values).standardDeviation();
		const sample = SequenceCollection.from(values).sampleStandardDeviation();

		expect(sample).toBeGreaterThan(population);
		expect(sample).toBeCloseTo(2.138, 3);
	});

	it('should apply a selector', () => {
		expect(
			SequenceCollection.from([{ n: 3 }, { n: 3 }]).standardDeviation(
				(v) => v.n,
			),
		).toBe(0);
	});

	it('should throw on an empty sequence', () => {
		expect(() =>
			SequenceCollection.empty<number>().standardDeviation(),
		).toThrow(/empty/i);
	});

	it('should refuse a sample of one', () => {
		// Answering 0 would claim a single measurement says something about the
		// spread it came from.
		expect(() =>
			SequenceCollection.from([1]).sampleStandardDeviation(),
		).toThrow(/at least two/i);
	});
});
