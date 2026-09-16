import { describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';
import { SequenceCollection } from '@/collections/sequence';

/**
 * Behavior suite for the operators brought over from the synchronous
 * sequence.
 *
 * Two questions run through all of it, and they are different questions.
 *
 * **Does it agree?** An operator that shares a name with a synchronous one has
 * to answer what that one answers, or the shared name is a lie. So most of
 * these run both over the same data and compare, rather than asserting a
 * literal someone typed out — a literal can be wrong in the same direction as
 * the code.
 *
 * **Does it stream?** Agreement alone would be satisfied by collecting
 * everything and delegating. What makes these worth having on an
 * `AsyncSequence` is that they hold a window rather than the source, and stop
 * pulling once the answer is settled. Neither shows up in the result, so both
 * are counted.
 */

/**
 * A source that reports how far it has been pulled.
 *
 * @param values Elements to yield.
 * @returns The asynchronous iterable and a reader of how far it got.
 */
const counted = <T>(
	values: readonly T[],
): { source: AsyncIterable<T>; pulled: () => number } => {
	let pulled = 0;

	return {
		source: {
			async *[Symbol.asyncIterator](): AsyncIterator<T> {
				for (const value of values) {
					pulled++;
					await Promise.resolve();
					yield value;
				}
			},
		},
		pulled: () => pulled,
	};
};

/**
 * Wraps an array as an asynchronous sequence.
 *
 * @param values Elements to yield.
 * @returns The sequence.
 */
const streamOf = <T>(values: readonly T[]): AsyncIterable<T> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		yield* values;
	},
});

/** A source that never ends, for proving an operator stops pulling. */
const endless = (): AsyncIterable<number> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<number> {
		for (let value = 0; ; value++) yield value;
	},
});

/** Records the suites query, so the assertions are not all about numbers. */
interface Order {
	readonly id: number;
	readonly region: string;
	readonly total: number;
}

/** The dataset both halves are run over. */
const ORDERS: readonly Order[] = Array.from({ length: 200 }, (_, index) => ({
	id: index,
	region: ['north', 'south', 'east', 'west'][index % 4],
	total: (index * 37) % 500,
}));

describe('the numeric terminals', () => {
	it.each([
		['sum', (o: Order) => o.total],
		['average', (o: Order) => o.total],
		['min', (o: Order) => o.total],
		['max', (o: Order) => o.total],
	])('should agree with the synchronous %s', async (name, selector) => {
		type Numeric = 'sum' | 'average' | 'min' | 'max';

		const expected = SequenceCollection.from(ORDERS)[name as Numeric](selector);

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))[
			name as Numeric
		](selector);

		expect(actual).toBe(expected);
	});

	it('should work without a selector, over plain numbers', async () => {
		const values = [3, 1, 4, 1, 5, 9, 2, 6];

		const sequence = AsyncSequenceCollection.from(streamOf(values));

		expect(await sequence.sum()).toBe(31);
		expect(await AsyncSequenceCollection.from(streamOf(values)).min()).toBe(1);
		expect(await AsyncSequenceCollection.from(streamOf(values)).max()).toBe(9);
	});

	it('should sum an empty sequence to zero', async () => {
		expect(await AsyncSequenceCollection.from(streamOf([])).sum()).toBe(0);
	});

	it.each(['average', 'min', 'max'])(
		'should refuse %s on an empty sequence',
		async (name) => {
			type Numeric = 'average' | 'min' | 'max';

			await expect(
				AsyncSequenceCollection.from(streamOf<number>([]))[name as Numeric](),
			).rejects.toThrow(/at least one element/);
		},
	);

	it.each(['minBy', 'maxBy'])(
		'should agree with the synchronous %s',
		async (name) => {
			type Extreme = 'minBy' | 'maxBy';

			const expected = SequenceCollection.from(ORDERS)[name as Extreme](
				(order) => order.total,
			);

			const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))[
				name as Extreme
			]((order) => order.total);

			expect(actual).toEqual(expected);
		},
	);

	it('should keep the first of several equal keys', async () => {
		// The tie rule the synchronous operators keep: a candidate has to beat
		// the incumbent, not merely match it.
		const tied = [
			{ id: 1, score: 5 },
			{ id: 2, score: 5 },
		];

		const best = await AsyncSequenceCollection.from(streamOf(tied)).maxBy(
			(entry) => entry.score,
		);

		expect(best.id).toBe(1);
	});

	it('should await a selector that has to wait', async () => {
		const total = await AsyncSequenceCollection.from(streamOf([1, 2, 3])).sum(
			async (value) => {
				await Promise.resolve();
				return value * 10;
			},
		);

		expect(total).toBe(60);
	});
});

describe('the spread terminals', () => {
	it.each(['standardDeviation', 'sampleStandardDeviation'])(
		'should agree with the synchronous %s',
		async (name) => {
			type Spread = 'standardDeviation' | 'sampleStandardDeviation';

			const expected = SequenceCollection.from(ORDERS)[name as Spread](
				(order) => order.total,
			);

			const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))[
				name as Spread
			]((order) => order.total);

			// Close rather than exact, and deliberately: this accumulates each
			// value as it arrives instead of collecting them to find a mean and
			// revisiting them, so the two take different routes to the same
			// number and the last bits of floating point need not match.
			expect(actual).toBeCloseTo(expected, 9);
		},
	);

	it('should stay accurate on values far from zero', async () => {
		// Where the textbook formula loses precision to cancellation: the squares
		// of these are enormous and nearly equal.
		const values = [1e9 + 4, 1e9 + 7, 1e9 + 13, 1e9 + 16];

		const actual = await AsyncSequenceCollection.from(
			streamOf(values),
		).standardDeviation();

		const expected = SequenceCollection.from(values).standardDeviation();

		expect(actual).toBeCloseTo(expected, 6);
		expect(actual).toBeGreaterThan(0);
	});

	it('should refuse a sample of one', async () => {
		await expect(
			AsyncSequenceCollection.from(streamOf([1])).sampleStandardDeviation(),
		).rejects.toThrow(/at least two elements/);
	});
});

describe('the single element terminals', () => {
	it('should return the only element', async () => {
		expect(await AsyncSequenceCollection.from(streamOf(['a'])).single()).toBe(
			'a',
		);
		expect(
			await AsyncSequenceCollection.from(streamOf(['a'])).singleOrNull(),
		).toBe('a');
	});

	it('should refuse more than one', async () => {
		await expect(
			AsyncSequenceCollection.from(streamOf(['a', 'b'])).single(),
		).rejects.toThrow(/more than one/);
	});

	it('should stop at the second element rather than draining', async () => {
		// The answer is settled there, and the source may not end.
		const { source, pulled } = counted(['a', 'b', 'c', 'd', 'e']);

		await expect(
			AsyncSequenceCollection.from(source).single(),
		).rejects.toThrow();

		expect(pulled()).toBe(2);
	});

	it('should tell an empty sequence apart', async () => {
		await expect(
			AsyncSequenceCollection.from(streamOf([])).single(),
		).rejects.toThrow(/no element/);

		expect(
			await AsyncSequenceCollection.from(streamOf([])).singleOrNull(),
		).toBeNull();
	});

	it('should read the element at a position', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf(['a', 'b', 'c'])).elementAt(
				1,
			),
		).toBe('b');
	});

	it('should refuse an index out of range', async () => {
		await expect(
			AsyncSequenceCollection.from(streamOf(['a'])).elementAt(5),
		).rejects.toThrow(/out of range/);
	});

	it('should find a value and stop there', async () => {
		const { source, pulled } = counted([1, 2, 3, 4, 5]);

		expect(await AsyncSequenceCollection.from(source).contains(2)).toBe(true);
		expect(pulled()).toBe(2);
	});

	it('should answer false having read everything', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3])).contains(9),
		).toBe(false);
	});
});

describe('sequenceEqual', () => {
	it('should agree when both hold the same elements', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3])).sequenceEqual([
				1, 2, 3,
			]),
		).toBe(true);
	});

	it.each([
		['a different element', [1, 9, 3]],
		['a shorter second', [1, 2]],
		['a longer second', [1, 2, 3, 4]],
	])('should reject %s', async (_label, second) => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3])).sequenceEqual(
				second,
			),
		).toBe(false);
	});

	it('should compare against another stream', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3])).sequenceEqual(
				streamOf([1, 2, 3]),
			),
		).toBe(true);
	});

	it('should stop at the first difference', async () => {
		const { source, pulled } = counted([1, 2, 3, 4, 5]);

		expect(
			await AsyncSequenceCollection.from(source).sequenceEqual([1, 9, 3, 4, 5]),
		).toBe(false);

		expect(pulled()).toBe(2);
	});
});

describe('the ends of the sequence', () => {
	it('should append and prepend', async () => {
		const values = AsyncSequenceCollection.from(streamOf([2, 3]))
			.append(4)
			.prepend(1);

		expect(await values.toArray()).toEqual([1, 2, 3, 4]);
	});

	it('should yield prepended values before touching the source', async () => {
		// A header can be handed over without waiting for a stream to open.
		const { source, pulled } = counted([2, 3]);

		const iterator = AsyncSequenceCollection.from(source)
			.prepend(1)
			[Symbol.asyncIterator]();

		expect((await iterator.next()).value).toBe(1);
		expect(pulled()).toBe(0);
	});

	it('should fall back only when nothing arrived', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf<number>([]))
				.defaultIfEmpty(0)
				.toArray(),
		).toEqual([0]);

		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2]))
				.defaultIfEmpty(0)
				.toArray(),
		).toEqual([1, 2]);
	});

	it('should take the trailing elements', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3, 4, 5]))
				.takeLast(2)
				.toArray(),
		).toEqual([4, 5]);
	});

	it('should drop the trailing elements', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3, 4, 5]))
				.skipLast(2)
				.toArray(),
		).toEqual([1, 2, 3]);
	});

	it('should let skipLast stream, unlike takeLast', async () => {
		// `skipLast` releases an element once `count` more have arrived behind
		// it, so it yields while the source is still going. `takeLast` cannot:
		// nothing knows the last two of something still arriving.
		const first = await AsyncSequenceCollection.from(endless())
			.skipLast(2)
			.take(3)
			.toArray();

		expect(first).toEqual([0, 1, 2]);
	});

	it.each([
		['takeLast', 'takeLast'],
		['skipLast', 'skipLast'],
	])('should agree with the synchronous %s', async (_label, name) => {
		type Trailing = 'takeLast' | 'skipLast';

		const expected = SequenceCollection.from(ORDERS)
			[name as Trailing](7)
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))
			[name as Trailing](7)
			.toArray();

		expect(actual).toEqual(expected);
	});
});

describe('windows', () => {
	it('should pair each element with the one before it', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3, 4]))
				.pairwise()
				.toArray(),
		).toEqual([
			[1, 2],
			[2, 3],
			[3, 4],
		]);
	});

	it('should yield nothing from fewer than two elements', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1]))
				.pairwise()
				.toArray(),
		).toEqual([]);
	});

	it('should pair elements that are themselves undefined', async () => {
		// Held as a sentinel rather than as `undefined`, or the first pair would
		// be silently dropped.
		const values: (number | undefined)[] = [undefined, 1, undefined];

		expect(
			await AsyncSequenceCollection.from(streamOf(values)).pairwise().toArray(),
		).toEqual([
			[undefined, 1],
			[1, undefined],
		]);
	});

	it('should yield overlapping windows', async () => {
		expect(
			await AsyncSequenceCollection.from(streamOf([1, 2, 3, 4]))
				.windowed(2)
				.toArray(),
		).toEqual([
			[1, 2],
			[2, 3],
			[3, 4],
		]);
	});

	it('should hand out copies, not the window it keeps moving', async () => {
		const windows = await AsyncSequenceCollection.from(streamOf([1, 2, 3]))
			.windowed(2)
			.toArray();

		expect(windows[0]).toEqual([1, 2]);
		expect(windows[1]).toEqual([2, 3]);
	});

	it('should stream rather than wait for the end', async () => {
		const first = await AsyncSequenceCollection.from(endless())
			.windowed(3)
			.take(2)
			.toArray();

		expect(first).toEqual([
			[0, 1, 2],
			[1, 2, 3],
		]);
	});

	it.each([0, -1, 1.5])('should reject a size of %s', (size) => {
		expect(() =>
			AsyncSequenceCollection.from(streamOf([1])).windowed(size),
		).toThrow(/positive integer/i);
	});
});

describe('groupAdjacent', () => {
	it('should open a new group whenever the key changes', async () => {
		const runs = await AsyncSequenceCollection.from(
			streamOf(['a', 'a', 'b', 'a']),
		)
			.groupAdjacent((letter) => letter)
			.toArray();

		expect(runs.map((run) => run.key)).toEqual(['a', 'b', 'a']);
		expect(runs.map((run) => run.count())).toEqual([2, 1, 1]);
	});

	it('should agree with the synchronous operator', async () => {
		const expected = SequenceCollection.from(ORDERS)
			.groupAdjacent((order) => order.region)
			.select((run) => [run.key, run.count()])
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))
			.groupAdjacent((order) => order.region)
			.select((run) => [run.key, run.count()])
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should hold only the run in hand', async () => {
		// The reason this is the grouping operator a stream can have: a run is
		// closed and handed over as soon as the key changes.
		const first = await AsyncSequenceCollection.from(endless())
			.groupAdjacent((value) => Math.floor(value / 2))
			.take(2)
			.toArray();

		expect(first.map((run) => run.toArray())).toEqual([
			[0, 1],
			[2, 3],
		]);
	});
});

describe('zip', () => {
	it('should merge pairwise and stop at the shorter', async () => {
		const merged = AsyncSequenceCollection.from(streamOf([1, 2, 3])).zip(
			['a', 'b'],
			(number, letter) => `${number}${letter}`,
		);

		expect(await merged.toArray()).toEqual(['1a', '2b']);
	});

	it('should zip an endless source with a finite one', async () => {
		// Both sides are pulled in step, so this finishes.
		const merged = AsyncSequenceCollection.from(endless()).zip(
			['a', 'b'],
			(number, letter) => `${number}${letter}`,
		);

		expect(await merged.toArray()).toEqual(['0a', '1b']);
	});

	it('should zip against another stream', async () => {
		const merged = AsyncSequenceCollection.from(streamOf([1, 2])).zip(
			streamOf(['a', 'b']),
			(number, letter) => `${number}${letter}`,
		);

		expect(await merged.toArray()).toEqual(['1a', '2b']);
	});

	it('should await a result selector that has to wait', async () => {
		const merged = AsyncSequenceCollection.from(streamOf([1])).zip(
			['a'],
			async (number, letter) => {
				await Promise.resolve();
				return `${number}${letter}`;
			},
		);

		expect(await merged.toArray()).toEqual(['1a']);
	});
});

describe('the set operations', () => {
	it.each([
		['except', 'except'],
		['intersect', 'intersect'],
		['union', 'union'],
	])('should agree with the synchronous %s', async (_label, name) => {
		type SetOp = 'except' | 'intersect' | 'union';

		const second = [1, 2, 3, 99];
		const first = [3, 1, 4, 1, 5];

		const expected = SequenceCollection.from(first)
			[name as SetOp](second)
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(first))
			[name as SetOp](second)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it.each([
		['exceptBy', 'exceptBy'],
		['intersectBy', 'intersectBy'],
	])('should agree with the synchronous %s', async (_label, name) => {
		type KeyedOp = 'exceptBy' | 'intersectBy';

		const keys = ['north', 'south'];

		const expected = SequenceCollection.from(ORDERS)
			[name as KeyedOp](keys, (order) => order.region)
			.select((order) => order.id)
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS))
			[name as KeyedOp](keys, (order) => order.region)
			.select((order) => order.id)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should agree with the synchronous unionBy', async () => {
		const second = ORDERS.slice(0, 10);

		const expected = SequenceCollection.from(ORDERS.slice(5))
			.unionBy(second, (order) => order.region)
			.select((order) => order.id)
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS.slice(5)))
			.unionBy(second, (order) => order.region)
			.select((order) => order.id)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should take the second side from another stream', async () => {
		const kept = AsyncSequenceCollection.from(streamOf([1, 2, 3])).intersect(
			streamOf([2, 3, 4]),
		);

		expect(await kept.toArray()).toEqual([2, 3]);
	});

	it('should read the second side before yielding anything', async () => {
		// It has to: whether the first element survives depends on what the
		// other sequence holds. What that bounds is the argument, never the
		// stream this is called on.
		const { source, pulled } = counted([1, 2, 3]);

		const iterator = AsyncSequenceCollection.from(source)
			.except([9])
			[Symbol.asyncIterator]();

		expect((await iterator.next()).value).toBe(1);
		expect(pulled()).toBe(1);
	});
});

describe('the joins', () => {
	/** The inner side both joins correlate against. */
	const regions = [
		{ name: 'north', manager: 'ana' },
		{ name: 'south', manager: 'bruno' },
		{ name: 'north', manager: 'carla' },
	];

	it('should agree with the synchronous join', async () => {
		const expected = SequenceCollection.from(ORDERS.slice(0, 8))
			.join(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order, region) => `${order.id}:${region.manager}`,
			)
			.toArray();

		const actual = await AsyncSequenceCollection.from(
			streamOf(ORDERS.slice(0, 8)),
		)
			.join(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order, region) => `${order.id}:${region.manager}`,
			)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should agree with the synchronous groupJoin', async () => {
		const expected = SequenceCollection.from(ORDERS.slice(0, 8))
			.groupJoin(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order, matches) => `${order.id}:${matches.count()}`,
			)
			.toArray();

		const actual = await AsyncSequenceCollection.from(
			streamOf(ORDERS.slice(0, 8)),
		)
			.groupJoin(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order, matches) => `${order.id}:${matches.count()}`,
			)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should keep an outer element with no matches, in groupJoin only', async () => {
		const lonely = [{ id: 1, region: 'nowhere', total: 0 }];

		const joined = await AsyncSequenceCollection.from(streamOf(lonely))
			.join(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order) => order.id,
			)
			.toArray();

		const grouped = await AsyncSequenceCollection.from(streamOf(lonely))
			.groupJoin(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order, matches) => `${order.id}:${matches.count()}`,
			)
			.toArray();

		expect(joined).toEqual([]);
		expect(grouped).toEqual(['1:0']);
	});

	it('should index the inner side once, not once per outer element', async () => {
		let innerReads = 0;

		const inner = {
			*[Symbol.iterator](): Iterator<{ name: string }> {
				for (const region of regions) {
					innerReads++;
					yield region;
				}
			},
		};

		await AsyncSequenceCollection.from(streamOf(ORDERS.slice(0, 20)))
			.join(
				inner,
				(order) => order.region,
				(region) => region.name,
				(order) => order.id,
			)
			.toArray();

		expect(innerReads).toBe(regions.length);
	});
});

describe('the map terminals', () => {
	it('should agree with the synchronous countBy', async () => {
		const expected = SequenceCollection.from(ORDERS).countBy(
			(order) => order.region,
		);

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS)).countBy(
			(order) => order.region,
		);

		expect([...actual.entries()]).toEqual([...expected.entries()]);
	});

	it('should agree with the synchronous toMap', async () => {
		const expected = SequenceCollection.from(ORDERS).toMap(
			(order) => order.id,
			(order) => order.total,
		);

		const actual = await AsyncSequenceCollection.from(streamOf(ORDERS)).toMap(
			(order) => order.id,
			(order) => order.total,
		);

		expect([...actual.entries()]).toEqual([...expected.entries()]);
	});

	it('should refuse two elements sharing a key', async () => {
		await expect(
			AsyncSequenceCollection.from(streamOf(ORDERS)).toMap(
				(order) => order.region,
			),
		).rejects.toThrow(/two elements/);
	});

	it('should agree with the synchronous toLookup', async () => {
		const expected = SequenceCollection.from(ORDERS).toLookup(
			(order) => order.region,
			(order) => order.id,
		);

		const actual = await AsyncSequenceCollection.from(
			streamOf(ORDERS),
		).toLookup(
			(order) => order.region,
			(order) => order.id,
		);

		expect([...actual.entries()]).toEqual([...expected.entries()]);
	});

	it('should keep the element itself without a selector', async () => {
		const mapped = await AsyncSequenceCollection.from(
			streamOf([{ id: 1 }, { id: 2 }]),
		).toMap((entry) => entry.id);

		expect(mapped.get(1)).toEqual({ id: 1 });
	});
});

describe('cancellation', () => {
	it.each([
		['sum', (sequence: ReturnType<typeof numbers>) => sequence.sum()],
		['average', (sequence: ReturnType<typeof numbers>) => sequence.average()],
		[
			'countBy',
			(sequence: ReturnType<typeof numbers>) =>
				sequence.countBy((value) => value),
		],
		[
			'toMap',
			(sequence: ReturnType<typeof numbers>) =>
				sequence.toMap((value) => value),
		],
		['single', (sequence: ReturnType<typeof numbers>) => sequence.single()],
	])(
		'should reject %s with the reason the signal carries',
		async (_label, run) => {
			const controller = new AbortController();
			const reason = new Error('called off');

			controller.abort(reason);

			await expect(run(numbers(controller.signal))).rejects.toBe(reason);
		},
	);

	/**
	 * Builds a sequence whose terminal is handed an aborted signal.
	 *
	 * @param signal Signal the terminal is given.
	 * @returns The sequence, with the signal already bound by the caller.
	 */
	function numbers(signal: AbortSignal) {
		const sequence = AsyncSequenceCollection.from(streamOf([1, 2, 3]));

		return {
			sum: () => sequence.sum(undefined, { signal }),
			average: () => sequence.average(undefined, { signal }),
			countBy: <K>(keySelector: (value: number) => K) =>
				sequence.countBy(keySelector, { signal }),
			toMap: <K>(keySelector: (value: number) => K) =>
				sequence.toMap(keySelector, undefined, { signal }),
			single: () => sequence.single({ signal }),
		};
	}
});
