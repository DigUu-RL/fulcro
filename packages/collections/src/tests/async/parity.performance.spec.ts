import { beforeAll, describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';

/**
 * Performance suite for the operators brought over from the synchronous
 * sequence.
 *
 * Counted, not timed. What is being asserted is not that these are fast but
 * that they are **streaming**: an implementation that collected the source and
 * delegated to the synchronous operator would return the right answer to every
 * behaviour test and be useless on the thing this type exists for.
 *
 * So each assertion is about one of three properties, none of which appears in
 * the result — how far the source was pulled, how much is held while it runs,
 * and whether the second side was read more than once.
 */

/** Elements the counting assertions run over. */
const SIZE = 50_000;

/** A line on an order, so the records are not flat. */
interface LineItem {
	readonly sku: string;
	readonly quantity: number;
}

/** The record every assertion below works on. */
interface Order {
	readonly id: number;
	readonly region: string;
	readonly total: number;
	readonly items: readonly LineItem[];
}

let orders: readonly Order[] = [];

beforeAll(() => {
	// Built once. A dataset rebuilt per test would make every count below a
	// measurement of the builder.
	orders = Array.from({ length: SIZE }, (_, index) => ({
		id: index,
		region: ['north', 'south', 'east', 'west'][index % 4],
		total: (index * 7919) % 50_000,
		items: [
			{ sku: `sku-${index % 97}`, quantity: (index % 5) + 1 },
			{ sku: `sku-${index % 89}`, quantity: (index % 3) + 1 },
		],
	}));
});

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
					yield value;
				}
			},
		},
		pulled: () => pulled,
	};
};

/** A source that never ends, for proving an operator yields before it. */
const endless = (): AsyncIterable<number> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<number> {
		for (let value = 0; ; value++) yield value;
	},
});

describe('the terminals read the source once', () => {
	it.each([
		['sum', (sequence: AsyncSequenceOf<Order>) => sequence.sum((o) => o.total)],
		[
			'average',
			(sequence: AsyncSequenceOf<Order>) => sequence.average((o) => o.total),
		],
		['min', (sequence: AsyncSequenceOf<Order>) => sequence.min((o) => o.total)],
		[
			'maxBy',
			(sequence: AsyncSequenceOf<Order>) => sequence.maxBy((o) => o.total),
		],
		[
			'countBy',
			(sequence: AsyncSequenceOf<Order>) => sequence.countBy((o) => o.region),
		],
		[
			'toLookup',
			(sequence: AsyncSequenceOf<Order>) => sequence.toLookup((o) => o.region),
		],
		[
			'standardDeviation',
			(sequence: AsyncSequenceOf<Order>) =>
				sequence.standardDeviation((o) => o.total),
		],
	])('should pull %s elements exactly once each', async (_label, run) => {
		const { source, pulled } = counted(orders);

		await run(AsyncSequenceCollection.from(source));

		expect(pulled()).toBe(SIZE);
	});

	/** Shorthand for the sequence type the cases above are handed. */
	type AsyncSequenceOf<T> = ReturnType<typeof AsyncSequenceCollection.from<T>>;
});

describe('the terminals that can stop, stop', () => {
	it('should leave contains where it found the value', async () => {
		const { source, pulled } = counted(orders);

		await AsyncSequenceCollection.from(source).contains(orders[2]);

		expect(pulled()).toBe(3);
	});

	it('should leave single at the second element', async () => {
		const { source, pulled } = counted(orders);

		await expect(
			AsyncSequenceCollection.from(source).single(),
		).rejects.toThrow();

		expect(pulled()).toBe(2);
	});

	it('should leave sequenceEqual at the first difference', async () => {
		const { source, pulled } = counted(orders);

		const different: readonly Order[] = [
			orders[0],
			{ ...orders[1], id: -1 },
			...orders.slice(2),
		];

		await AsyncSequenceCollection.from(source).sequenceEqual(different);

		expect(pulled()).toBe(2);
	});

	it('should leave elementAt at the position asked for', async () => {
		const { source, pulled } = counted(orders);

		await AsyncSequenceCollection.from(source).elementAt(9);

		expect(pulled()).toBe(10);
	});
});

describe('the windows hold a window, not the stream', () => {
	it.each([
		['windowed', (sequence: AsyncSequenceOfNumbers) => sequence.windowed(3)],
		['pairwise', (sequence: AsyncSequenceOfNumbers) => sequence.pairwise()],
		['skipLast', (sequence: AsyncSequenceOfNumbers) => sequence.skipLast(3)],
		[
			'groupAdjacent',
			(sequence: AsyncSequenceOfNumbers) =>
				sequence.groupAdjacent((value) => Math.floor(value / 2)),
		],
	])('should let %s yield before the source ends', async (_label, build) => {
		// The property that matters, and the one an implementation collecting the
		// source would fail: over an endless source, these still produce. A test
		// that only checked the values would pass on a version that buffered
		// everything — this one would never return.
		const first = await build(AsyncSequenceCollection.from(endless()))
			.take(2)
			.toArray();

		expect(first).toHaveLength(2);
	});

	it('should hold only the window skipLast was given', async () => {
		// Released once `count` more have arrived behind it, so what is pulled
		// stays a step ahead of what is yielded rather than a stream ahead.
		const { source, pulled } = counted(orders);

		const first = await AsyncSequenceCollection.from(source)
			.skipLast(5)
			.take(1)
			.toArray();

		expect(first).toHaveLength(1);
		expect(pulled()).toBeLessThanOrEqual(7);
	});

	/** Shorthand for the sequence type the cases above are handed. */
	type AsyncSequenceOfNumbers = ReturnType<
		typeof AsyncSequenceCollection.from<number>
	>;
});

describe('takeLast is the one that cannot stream, and says so', () => {
	it('should read the whole source before yielding anything', async () => {
		// Nothing can know the last five of something still arriving. What it
		// does keep bounded is memory: five elements, not fifty thousand.
		const { source, pulled } = counted(orders);

		const iterator = AsyncSequenceCollection.from(source)
			.takeLast(5)
			[Symbol.asyncIterator]();

		const first = await iterator.next();

		expect(first.done).toBe(false);
		expect(pulled()).toBe(SIZE);
	});
});

describe('the second side is read once', () => {
	it('should index the inner side of a join a single time', async () => {
		let innerReads = 0;

		const regions = ['north', 'south', 'east', 'west'].map((name) => ({
			name,
		}));

		const inner: Iterable<{ name: string }> = {
			*[Symbol.iterator](): Iterator<{ name: string }> {
				for (const region of regions) {
					innerReads++;
					yield region;
				}
			},
		};

		await AsyncSequenceCollection.from(orders)
			.join(
				inner,
				(order) => order.region,
				(region) => region.name,
				(order) => order.id,
			)
			.toArray();

		// Four, not four times fifty thousand. Scanning the inner side per outer
		// element is the classic way a join turns quadratic, and on a stream it
		// would be a scan per element of something that may never end.
		expect(innerReads).toBe(regions.length);
	});

	it('should read the excluded side of a set operation a single time', async () => {
		let secondReads = 0;

		const second: Iterable<number> = {
			*[Symbol.iterator](): Iterator<number> {
				for (const value of [1, 2, 3]) {
					secondReads++;
					yield value;
				}
			},
		};

		await AsyncSequenceCollection.from(orders)
			.exceptBy(second, (order) => order.id)
			.toArray();

		expect(secondReads).toBe(3);
	});
});

describe('smoke ceilings', () => {
	it('should aggregate fifty thousand records within a generous ceiling', async () => {
		const started: number = performance.now();

		const total: number = await AsyncSequenceCollection.from(orders).sum(
			(order) => order.total,
		);

		// A smoke ceiling, not a budget: it exists to catch the regression that
		// turns seconds into minutes.
		expect(performance.now() - started).toBeLessThan(3_000);
		expect(total).toBeGreaterThan(0);
	});

	it('should group and join fifty thousand records within a generous ceiling', async () => {
		const regions = ['north', 'south', 'east', 'west'].map((name) => ({
			name,
		}));

		const started: number = performance.now();

		const joined: number = await AsyncSequenceCollection.from(orders)
			.join(
				regions,
				(order) => order.region,
				(region) => region.name,
				(order) => order.id,
			)
			.count();

		expect(performance.now() - started).toBeLessThan(3_000);
		expect(joined).toBe(SIZE);
	});
});
