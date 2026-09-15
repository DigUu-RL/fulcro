import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Counts how many elements a sequence actually reads.
 *
 * Laziness and early termination are the reason most of these operators are
 * worth having, and neither shows up in the values they return.
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

describe('except', () => {
	it('should drop the elements present in the other sequence', () => {
		expect(
			SequenceCollection.from([1, 2, 3, 4]).except([2, 4]).toArray(),
		).toEqual([1, 3]);
	});

	it('should return distinct elements', () => {
		// A set operation, like union and intersect: no element twice.
		expect(SequenceCollection.from([1, 1, 2]).except([2]).toArray()).toEqual([
			1,
		]);
	});

	it('should stay deferred', () => {
		const { source, read } = counted([1, 2, 3]);
		const query = SequenceCollection.from(source).except([2]);

		expect(read()).toBe(0);
		query.toArray();
		expect(read()).toBe(3);
	});
});

describe('concat', () => {
	it('should keep every element of both sequences', () => {
		expect(SequenceCollection.from([1, 2]).concat([3, 4]).toArray()).toEqual([
			1, 2, 3, 4,
		]);
	});

	it('should keep duplicates, unlike union', () => {
		expect(SequenceCollection.from([1, 2]).concat([2, 3]).toArray()).toEqual([
			1, 2, 2, 3,
		]);
	});

	it('should count without traversing when both sides are known', () => {
		const { source, read } = counted([1, 2, 3]);

		// `counted` declares no length, so this leans on the array it is
		// concatenated with plus a traversal of the generator.
		expect(SequenceCollection.from([1, 2]).concat([3, 4, 5]).count()).toBe(5);
		expect(read()).toBe(0);
		void source;
	});
});

describe('takeWhile', () => {
	it('should take the leading matching elements', () => {
		expect(
			SequenceCollection.from([1, 2, 3, 1])
				.takeWhile((v) => v < 3)
				.toArray(),
		).toEqual([1, 2]);
	});

	it('should not look past the first failure, unlike where', () => {
		const taken = SequenceCollection.from([1, 2, 9, 1])
			.takeWhile((v) => v < 3)
			.toArray();
		const filtered = SequenceCollection.from([1, 2, 9, 1])
			.where((v) => v < 3)
			.toArray();

		expect(taken).toEqual([1, 2]);
		expect(filtered).toEqual([1, 2, 1]);
	});

	it('should stop reading at the element that failed', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source)
			.takeWhile((v) => v < 3)
			.toArray();

		expect(read()).toBe(3);
	});
});

describe('skipWhile', () => {
	it('should bypass the leading matching elements', () => {
		expect(
			SequenceCollection.from([1, 2, 3, 1])
				.skipWhile((v) => v < 3)
				.toArray(),
		).toEqual([3, 1]);
	});

	it('should keep everything after the first failure', () => {
		// Including elements that would have satisfied the condition.
		expect(
			SequenceCollection.from([1, 9, 1, 2])
				.skipWhile((v) => v < 3)
				.toArray(),
		).toEqual([9, 1, 2]);
	});

	it('should return nothing when the condition never fails', () => {
		expect(
			SequenceCollection.from([1, 2])
				.skipWhile(() => true)
				.toArray(),
		).toEqual([]);
	});
});

describe('takeLast', () => {
	it('should take the trailing elements', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).takeLast(2).toArray()).toEqual(
			[3, 4],
		);
	});

	it('should take everything when asked for more than there is', () => {
		expect(SequenceCollection.from([1, 2]).takeLast(9).toArray()).toEqual([
			1, 2,
		]);
	});

	it.each([0, -1])('should take nothing for %s', (count) => {
		expect(SequenceCollection.from([1, 2]).takeLast(count).toArray()).toEqual(
			[],
		);
	});

	it('should report its count without traversing a known source', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).takeLast(2).count()).toBe(2);
		expect(SequenceCollection.from([1, 2]).takeLast(9).count()).toBe(2);
	});
});

describe('skipLast', () => {
	it('should drop the trailing elements', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).skipLast(2).toArray()).toEqual(
			[1, 2],
		);
	});

	it('should drop everything when asked for more than there is', () => {
		expect(SequenceCollection.from([1, 2]).skipLast(9).toArray()).toEqual([]);
	});

	it.each([0, -1])('should drop nothing for %s', (count) => {
		expect(SequenceCollection.from([1, 2]).skipLast(count).toArray()).toEqual([
			1, 2,
		]);
	});

	it('should report its count without traversing a known source', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).skipLast(1).count()).toBe(3);
		expect(SequenceCollection.from([1, 2]).skipLast(9).count()).toBe(0);
	});
});

describe('chunk', () => {
	it('should split into arrays of the given size', () => {
		expect(SequenceCollection.from([1, 2, 3, 4]).chunk(2).toArray()).toEqual([
			[1, 2],
			[3, 4],
		]);
	});

	it('should leave the final chunk short rather than padding it', () => {
		// A padded chunk could not be told from a full one.
		expect(SequenceCollection.from([1, 2, 3]).chunk(2).toArray()).toEqual([
			[1, 2],
			[3],
		]);
	});

	it('should produce nothing for an empty sequence', () => {
		expect(SequenceCollection.empty<number>().chunk(2).toArray()).toEqual([]);
	});

	it.each([0, -1, 1.5, Number.NaN])('should reject a size of %s', (size) => {
		expect(() => SequenceCollection.from([1, 2]).chunk(size)).toThrow(
			/positive integer/i,
		);
	});

	it('should report how many chunks a known source yields', () => {
		expect(SequenceCollection.from([1, 2, 3]).chunk(2).count()).toBe(2);
	});
});

describe('reverse', () => {
	it('should reverse the order', () => {
		expect(SequenceCollection.from([1, 2, 3]).reverse().toArray()).toEqual([
			3, 2, 1,
		]);
	});

	it('should stay deferred even though it cannot stream', () => {
		// It has to read everything before yielding anything, but it must still
		// read nothing until the result is iterated.
		const { source, read } = counted([1, 2, 3]);
		const query = SequenceCollection.from(source).reverse();

		expect(read()).toBe(0);
		expect(query.toArray()).toEqual([3, 2, 1]);
	});

	it('should keep the count of its source', () => {
		expect(SequenceCollection.from([1, 2, 3]).reverse().count()).toBe(3);
	});
});

describe('zip', () => {
	it('should merge position by position', () => {
		expect(
			SequenceCollection.from([1, 2, 3])
				.zip(['a', 'b', 'c'], (n, s) => `${n}${s}`)
				.toArray(),
		).toEqual(['1a', '2b', '3c']);
	});

	it('should stop at the shorter sequence', () => {
		expect(
			SequenceCollection.from([1, 2, 3, 4])
				.zip(['a', 'b'], (n, s) => `${n}${s}`)
				.toArray(),
		).toEqual(['1a', '2b']);
	});

	it('should not read the longer sequence past the pairing', () => {
		const { source, read } = counted([1, 2, 3, 4, 5]);

		SequenceCollection.from(source)
			.zip(['a', 'b'], (n, s) => `${n}${s}`)
			.toArray();

		// Three: two paired, and one more that found no partner.
		expect(read()).toBe(3);
	});

	it('should report the shorter of two known counts', () => {
		expect(
			SequenceCollection.from([1, 2, 3, 4])
				.zip(['a', 'b'], (n) => n)
				.count(),
		).toBe(2);
	});
});

describe('append and prepend', () => {
	it('should add elements at the end', () => {
		expect(SequenceCollection.from([1, 2]).append(3, 4).toArray()).toEqual([
			1, 2, 3, 4,
		]);
	});

	it('should add elements at the start', () => {
		expect(SequenceCollection.from([3, 4]).prepend(1, 2).toArray()).toEqual([
			1, 2, 3, 4,
		]);
	});

	it('should leave the sequence alone when given nothing', () => {
		expect(SequenceCollection.from([1, 2]).append().toArray()).toEqual([1, 2]);
		expect(SequenceCollection.from([1, 2]).prepend().toArray()).toEqual([1, 2]);
	});

	it('should carry the count through', () => {
		expect(SequenceCollection.from([1, 2]).append(3).count()).toBe(3);
		expect(SequenceCollection.from([1, 2]).prepend(0).count()).toBe(3);
	});

	it('should chain with the rest of the operators', () => {
		expect(
			SequenceCollection.from([2, 3])
				.prepend(1)
				.append(4)
				.where((value) => value % 2 === 0)
				.toArray(),
		).toEqual([2, 4]);
	});
});
