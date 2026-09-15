import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Counts how many elements a sequence actually reads.
 *
 * Several of these operators are only worth having because they stop early, and
 * a test asserting the answer alone would pass just as happily on one that
 * drained its source every time.
 *
 * @param values Elements to yield.
 * @returns The iterable and a reader of how far it has been pulled.
 */
const counted = <T>(
	values: readonly T[],
): { source: Iterable<T>; read: () => number } => {
	let read = 0;

	return {
		source: {
			*[Symbol.iterator](): Iterator<T> {
				for (const value of values) {
					read++;
					yield value;
				}
			},
		},
		read: () => read,
	};
};

describe('all', () => {
	it('should hold when every element satisfies the condition', () => {
		expect(
			SequenceCollection.from([2, 4, 6]).all((value) => value % 2 === 0),
		).toBe(true);
	});

	it('should fail on the first counterexample', () => {
		expect(
			SequenceCollection.from([2, 3, 4]).all((value) => value % 2 === 0),
		).toBe(false);
	});

	it('should stop at the element that failed', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source).all((value) => value < 3);

		expect(read()).toBe(3);
	});

	it('should hold vacuously for an empty sequence', () => {
		// The convention everywhere this operator exists, and the only answer
		// that keeps `all(p)` and `!any(not p)` the same statement.
		expect(SequenceCollection.empty<number>().all(() => false)).toBe(true);
	});
});

describe('contains', () => {
	it('should find an element that is present', () => {
		expect(SequenceCollection.from([1, 2, 3]).contains(2)).toBe(true);
	});

	it('should not find one that is absent', () => {
		expect(SequenceCollection.from([1, 2, 3]).contains(9)).toBe(false);
	});

	it('should stop at the match', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source).contains(2);

		expect(read()).toBe(2);
	});

	it('should compare objects by identity', () => {
		const item = { id: 1 };

		expect(SequenceCollection.from([item]).contains(item)).toBe(true);
		expect(SequenceCollection.from([item]).contains({ id: 1 })).toBe(false);
	});

	it('should find a falsy element', () => {
		expect(SequenceCollection.from([0, 1]).contains(0)).toBe(true);
		expect(SequenceCollection.from(['', 'a']).contains('')).toBe(true);
	});
});

describe('single', () => {
	it('should return the only element', () => {
		expect(SequenceCollection.from([7]).single()).toBe(7);
	});

	it('should return the only element matching a condition', () => {
		expect(
			SequenceCollection.from([1, 2, 3]).single((value) => value === 2),
		).toBe(2);
	});

	it('should throw when nothing matches', () => {
		expect(() => SequenceCollection.from([1, 2]).single((v) => v > 5)).toThrow(
			/no element/i,
		);
	});

	it('should throw when more than one matches', () => {
		expect(() => SequenceCollection.from([1, 2, 3]).single()).toThrow(
			/more than one/i,
		);
	});

	it('should stop on the second match rather than draining the source', () => {
		// The failure must not cost more than the success.
		const { source, read } = counted([1, 2, 3, 4, 5]);

		expect(() => SequenceCollection.from(source).single()).toThrow();
		expect(read()).toBe(2);
	});

	it('should return a falsy single element rather than reporting absence', () => {
		expect(SequenceCollection.from([0]).single()).toBe(0);
	});
});

describe('singleOrNull', () => {
	it('should return null when nothing matches', () => {
		expect(
			SequenceCollection.from([1, 2]).singleOrNull((v) => v > 5),
		).toBeNull();
	});

	it('should still throw when more than one matches', () => {
		// An ambiguous answer is a defect in the query, not an absence to
		// tolerate, so this differs from `firstOrNull` on purpose.
		expect(() => SequenceCollection.from([1, 2]).singleOrNull()).toThrow(
			/more than one/i,
		);
	});

	it('should return the only match', () => {
		expect(
			SequenceCollection.from([1, 2, 3]).singleOrNull((v) => v === 3),
		).toBe(3);
	});
});

describe('elementAt', () => {
	it('should read the element at a position', () => {
		expect(SequenceCollection.from(['a', 'b', 'c']).elementAt(1)).toBe('b');
	});

	it('should stop at the requested position', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source).elementAt(1);

		expect(read()).toBe(2);
	});

	it('should throw past the end', () => {
		expect(() => SequenceCollection.from([1]).elementAt(5)).toThrow(/range/i);
	});

	it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'should reject %s as a position',
		(index) => {
			expect(() => SequenceCollection.from([1, 2]).elementAt(index)).toThrow(
				/range/i,
			);
		},
	);
});

describe('elementAtOrNull', () => {
	it('should return null past the end', () => {
		expect(SequenceCollection.from([1]).elementAtOrNull(5)).toBeNull();
	});

	it('should read a valid position', () => {
		expect(SequenceCollection.from([1, 2]).elementAtOrNull(0)).toBe(1);
	});
});

describe('defaultIfEmpty', () => {
	it('should yield the fallback for an empty sequence', () => {
		expect(
			SequenceCollection.empty<number>().defaultIfEmpty(0).toArray(),
		).toEqual([0]);
	});

	it('should leave a non-empty sequence alone', () => {
		expect(SequenceCollection.from([1, 2]).defaultIfEmpty(0).toArray()).toEqual(
			[1, 2],
		);
	});

	it('should count a known-empty source as one element', () => {
		expect(SequenceCollection.empty<number>().defaultIfEmpty(0).count()).toBe(
			1,
		);
	});

	it('should stay deferred', () => {
		const { source, read } = counted([1, 2, 3]);
		const query = SequenceCollection.from(source).defaultIfEmpty(0);

		expect(read()).toBe(0);
		query.toArray();
		expect(read()).toBe(3);
	});
});

describe('sequenceEqual', () => {
	it('should hold for equal sequences', () => {
		expect(SequenceCollection.from([1, 2, 3]).sequenceEqual([1, 2, 3])).toBe(
			true,
		);
	});

	it('should fail on differing order', () => {
		expect(SequenceCollection.from([1, 2, 3]).sequenceEqual([1, 3, 2])).toBe(
			false,
		);
	});

	it('should fail on differing length', () => {
		expect(SequenceCollection.from([1, 2]).sequenceEqual([1, 2, 3])).toBe(
			false,
		);
		expect(SequenceCollection.from([1, 2, 3]).sequenceEqual([1, 2])).toBe(
			false,
		);
	});

	it('should hold for two empty sequences', () => {
		expect(SequenceCollection.empty<number>().sequenceEqual([])).toBe(true);
	});

	it('should stop at the first difference', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source).sequenceEqual([1, 9, 9, 9, 9]);

		expect(read()).toBe(2);
	});
});
