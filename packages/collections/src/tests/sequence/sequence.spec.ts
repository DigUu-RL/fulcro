import { describe, it, expect } from 'vitest';
import { SequenceCollection } from '@/collections/sequence';

describe('SequenceCollection Unit Tests', () => {
	it('should allow accessing items by index (Proxy)', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);
		expect(numbers[0]).toBe(10);
		expect(numbers[1]).toBe(20);
		expect(numbers[2]).toBe(30);
		expect(numbers[3]).toBeUndefined();
	});

	it('should filter items with where() and maintain lazy evaluation', () => {
		const source = [1, 2, 3, 4, 5];
		const numbers = SequenceCollection.from(source);

		const filtered = numbers.where((n) => n % 2 === 0);
		expect(filtered.toArray()).toEqual([2, 4]);
	});

	it('should project items with select()', () => {
		const numbers = SequenceCollection.from([1, 2, 3]);
		const doubled = numbers.select((n) => n * 2);

		expect(doubled.toArray()).toEqual([2, 4, 6]);
	});

	it('should flatten collections with selectMany()', () => {
		const orders = SequenceCollection.from([
			{ items: ['apple', 'banana'] },
			{ items: ['orange'] },
		]);

		const allItems = orders.selectMany((o) => o.items);
		expect(allItems.toArray()).toEqual(['apple', 'banana', 'orange']);
	});

	it('should find the first element or throw if empty', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);

		expect(numbers.first()).toBe(10);
		expect(numbers.first((n) => n > 15)).toBe(20);
		expect(() => SequenceCollection.empty().first()).toThrow(
			'Sequence contains no elements',
		);
	});

	it('should find the first element or return null', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);

		expect(numbers.firstOrNull((n) => n > 50)).toBeNull();
		expect(SequenceCollection.empty().firstOrNull()).toBeNull();
	});

	it('should find the last element or throw if empty', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);

		expect(numbers.last()).toBe(30);
		expect(numbers.last((n) => n < 25)).toBe(20);
		expect(() => SequenceCollection.empty().last()).toThrow(
			'Sequence contains no elements',
		);
		expect(() => numbers.last((n) => n > 50)).toThrow(
			'Sequence contains no elements',
		);
	});

	it('should find the last element or return null', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);

		expect(numbers.lastOrNull()).toBe(30);
		expect(numbers.lastOrNull((n) => n > 50)).toBeNull();
		expect(SequenceCollection.empty().lastOrNull()).toBeNull();
	});

	it('should find the last element of a single pass source', () => {
		function* generate(): Generator<number> {
			yield 1;
			yield 2;
			yield 3;
		}

		expect(SequenceCollection.from(generate()).last()).toBe(3);
	});

	it('should return the correct count maximizing O(1) for arrays', () => {
		const numbers = SequenceCollection.from([1, 2, 3, 4, 5]);

		expect(numbers.count()).toBe(5);
		expect(numbers.count((n) => n > 2)).toBe(3);
	});

	it('should count sized sources without traversing them', () => {
		const set = new Set([1, 2, 3]);
		const map = new Map([
			['a', 1],
			['b', 2],
		]);

		expect(SequenceCollection.from(set).count()).toBe(3);
		expect(SequenceCollection.from(map).count()).toBe(2);
	});

	it('should keep the known count across cardinality preserving operators', () => {
		let traversals = 0;

		const source = {
			length: 4,
			*[Symbol.iterator](): Iterator<number> {
				traversals++;
				yield 1;
				yield 2;
				yield 3;
				yield 4;
			},
		};

		const numbers = SequenceCollection.from(source);

		expect(numbers.select((n) => n * 2).count()).toBe(4);
		expect(numbers.take(2).count()).toBe(2);
		expect(numbers.take(99).count()).toBe(4);
		expect(numbers.skip(3).count()).toBe(1);
		expect(numbers.skip(99).count()).toBe(0);
		expect(numbers.orderBy((n) => n).count()).toBe(4);
		expect(
			numbers
				.select((n) => n)
				.take(2)
				.count(),
		).toBe(2);
		expect(traversals).toBe(0);
	});

	it('should keep tracking a source that changes after creation', () => {
		const source = [1, 2];
		const numbers = SequenceCollection.from(source);

		source.push(3);

		expect(numbers.count()).toBe(3);
		expect(numbers.select((n) => n).count()).toBe(3);
		expect(numbers.skip(1).count()).toBe(2);
	});

	it('should fall back to traversing when the count depends on the data', () => {
		const numbers = SequenceCollection.from([1, 2, 3, 4]);

		expect(numbers.where((n) => n % 2 === 0).count()).toBe(2);
		expect(numbers.distinct().count()).toBe(4);
		expect(numbers.count((n) => n > 2)).toBe(2);

		function* generate(): Generator<number> {
			yield 1;
			yield 2;
		}

		expect(SequenceCollection.from(generate()).count()).toBe(2);
	});

	it('should evaluate any() correctly with short-circuiting', () => {
		const numbers = SequenceCollection.from([1, 2, 3]);

		expect(numbers.any()).toBe(true);
		expect(numbers.any((n) => n > 5)).toBe(false);
		expect(SequenceCollection.empty().any()).toBe(false);
	});

	it('should group elements by key using groupBy()', () => {
		const items = SequenceCollection.from([
			{ category: 'A', val: 1 },
			{ category: 'B', val: 2 },
			{ category: 'A', val: 3 },
		]);

		const grouped = items.groupBy((i) => i.category).toArray();

		expect(grouped.length).toBe(2);
		expect(grouped[0].key).toBe('A');
		expect(grouped[0].toArray()).toEqual([
			{ category: 'A', val: 1 },
			{ category: 'A', val: 3 },
		]);
		expect(grouped[1].key).toBe('B');
	});

	it('should paginate elements using take() and skip()', () => {
		const numbers = SequenceCollection.from([1, 2, 3, 4, 5]);

		const result = numbers.skip(2).take(2).toArray();
		expect(result).toEqual([3, 4]);
	});

	it('should sort elements with orderBy() and secondary thenBy()', () => {
		const items = SequenceCollection.from([
			{ name: 'John', age: 25 },
			{ name: 'Anna', age: 30 },
			{ name: 'Anna', age: 20 },
		]);

		const sorted = items
			.orderBy((i) => i.name)
			.thenBy((i) => i.age)
			.toArray();

		expect(sorted[0]).toEqual({ name: 'Anna', age: 20 });
		expect(sorted[1]).toEqual({ name: 'Anna', age: 30 });
		expect(sorted[2]).toEqual({ name: 'John', age: 25 });
	});

	it('should filter duplicates with distinct()', () => {
		const numbers = SequenceCollection.from([1, 1, 2, 2, 3]);
		expect(numbers.distinct().toArray()).toEqual([1, 2, 3]);
	});

	it('should execute union() and intersect() set operations', () => {
		const listA = SequenceCollection.from([1, 2, 3]);
		const listB = [3, 4, 5];

		expect(listA.union(listB).toArray()).toEqual([1, 2, 3, 4, 5]);
		expect(listA.intersect(listB).toArray()).toEqual([3]);
	});

	it('should execute mathematical aggregations (sum, average, min, max)', () => {
		const numbers = SequenceCollection.from([10, 20, 30]);

		expect(numbers.sum()).toBe(60);
		expect(numbers.average()).toBe(20);
		expect(numbers.min()).toBe(10);
		expect(numbers.max()).toBe(30);
	});

	it('should convert collection toMap()', () => {
		const items = SequenceCollection.from([
			{ id: 'x', val: 100 },
			{ id: 'y', val: 200 },
		]);

		const map = items.toMap(
			(i) => i.id,
			(i) => i.val,
		);
		expect(map.get('x')).toBe(100);
		expect(map.get('y')).toBe(200);
		expect(() => items.toMap((i) => 'same-key')).toThrow(
			'An item with the same key has already been added.',
		);
	});

	it('should execute action forEach()', () => {
		const numbers = SequenceCollection.from([10, 20]);
		const result: number[] = [];

		numbers.forEach((num, index) => {
			result.push(num + index);
		});

		expect(result).toEqual([10, 21]);
	});

	it('should join two collections relationaly', () => {
		const left = SequenceCollection.from([
			{ id: 1, name: 'A' },
			{ id: 2, name: 'B' },
		]);
		const right = [
			{ fk: 1, score: 100 },
			{ fk: 1, score: 90 },
		];

		const joined = left
			.join(
				right,
				(l) => l.id,
				(r) => r.fk,
				(l, r) => ({ name: l.name, score: r.score }),
			)
			.toArray();

		expect(joined.length).toBe(2);
		expect(joined[0]).toEqual({ name: 'A', score: 100 });
		expect(joined[1]).toEqual({ name: 'A', score: 90 });
	});

	it('should reduce items via aggregate() with custom seed types', () => {
		const words = SequenceCollection.from(['A', 'B', 'C']);
		const concatenated = words.aggregate(
			'Start:',
			(acc, item) => `${acc} ${item}`,
		);

		expect(concatenated).toBe('Start: A B C');
	});

	it('should create a secure static empty instance', () => {
		const empty = SequenceCollection.empty<number>();
		expect(empty.count()).toBe(0);
		expect(empty.toArray()).toEqual([]);
	});
});
