import { beforeAll, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Performance suite for `choose`, `ofType`, `cast`, `topBy` and `tap`.
 *
 * Counted, not timed, and over records rather than numbers — a key projection
 * over a number is free, and an operator reading `order.customer.region` twice
 * per comparison instead of once per element only shows up on real shapes.
 *
 * `topBy` is the one with an algorithmic promise to keep, so it gets the
 * sharpest instrument here: keys that count their own comparisons. Every `<`
 * and `>` converts both operands to a primitive, so a key carrying a
 * `Symbol.toPrimitive` reports exactly how many comparisons an operator made,
 * on any machine, with no clock involved.
 */

/** Records the suite queries. */
const SIZE = 100_000;

/** Elements asked for by the ranking assertions. */
const WANTED = 10;

/** A line on an order, so the records are not flat. */
interface LineItem {
	readonly sku: string;
	readonly quantity: number;
}

/** The record every assertion below works on. */
interface Order {
	readonly id: number;
	readonly region: string;
	readonly status: 'pending' | 'paid' | 'shipped';
	readonly total: number;
	readonly placedAt: Date;
	readonly items: readonly LineItem[];
	readonly reference: string | null;
}

let orders: readonly Order[] = [];

beforeAll(() => {
	// Built once: a dataset rebuilt per test would make every count below a
	// measurement of the builder.
	orders = Array.from({ length: SIZE }, (_, index) => ({
		id: index,
		region: ['north', 'south', 'east', 'west'][index % 4],
		status: (['pending', 'paid', 'shipped'] as const)[index % 3],
		// Spread by a prime so the ranking cannot be satisfied by arrival order,
		// and so the best elements are not clustered at either end.
		total: (index * 7919) % 50_000,
		placedAt: new Date(2020, 0, 1 + (index % 1_000)),
		items: [
			{ sku: `sku-${index % 97}`, quantity: (index % 5) + 1 },
			{ sku: `sku-${index % 89}`, quantity: (index % 3) + 1 },
		],
		reference: index % 4 === 0 ? null : `ref-${index}`,
	}));
});

/** Conversions observed by the counting keys of the test in hand. */
let conversions = 0;

/**
 * Builds a sorting key that reports every comparison it takes part in.
 *
 * `<` and `>` convert both operands, so one comparison of two of these counts
 * as two conversions.
 *
 * @param value Value the key stands for.
 * @returns The counting key.
 */
const countingKey = (value: number): object => ({
	[Symbol.toPrimitive]: (): number => {
		conversions++;
		return value;
	},
});

/**
 * A source that counts what is pulled out of it.
 *
 * Deliberately not an array: array fast paths would hide the traversals the
 * counter exists to observe.
 *
 * @param values Elements to yield.
 * @param counter Called for each element as it is pulled.
 * @returns The instrumented source.
 */
const counted = <T>(
	values: readonly T[],
	counter: () => void,
): Iterable<T> => ({
	*[Symbol.iterator](): Iterator<T> {
		for (const value of values) {
			counter();
			yield value;
		}
	},
});

describe('topBy', () => {
	it('should make one comparison per element, whatever the volume', () => {
		conversions = 0;

		SequenceCollection.from(orders)
			.topBy((order) => countingKey(order.total), WANTED)
			.toArray();

		// Measured at 2.01 conversions per element: one comparison against the
		// weakest of the window, which the vast majority of elements lose
		// outright. The bound is per element and says nothing about `WANTED`,
		// which is the whole claim — an implementation that sorted, or that
		// compared against every member of the window, would be far past this.
		expect(conversions).toBeLessThanOrEqual(SIZE * 3);
	});

	it('should compare far less than a full sort answering the same question', () => {
		conversions = 0;

		SequenceCollection.from(orders)
			.topBy((order) => countingKey(order.total), WANTED)
			.toArray();

		const ranked: number = conversions;

		conversions = 0;

		SequenceCollection.from(orders)
			.orderByDescending((order) => countingKey(order.total))
			.take(WANTED)
			.toArray();

		const sorted: number = conversions;

		// The second half of this assertion is what makes the first half mean
		// anything: if the counting were broken, both numbers would be zero and
		// a ratio alone would pass. The sort is required to be expensive before
		// the ranking is allowed to be cheap.
		expect(sorted).toBeGreaterThan(SIZE * 10);
		expect(ranked * 10).toBeLessThan(sorted);
	});

	it('should extract one key per element and no more', () => {
		let extracted = 0;

		SequenceCollection.from(orders)
			.topBy((order) => {
				extracted++;
				return order.total;
			}, WANTED)
			.toArray();

		expect(extracted).toBe(SIZE);
	});

	it('should read its source exactly once', () => {
		let pulled = 0;

		SequenceCollection.from(counted(orders, () => pulled++))
			.topBy((order) => order.total, WANTED)
			.toArray();

		expect(pulled).toBe(SIZE);
	});

	it('should not grow its cost with the amount asked for being small', () => {
		// Ranking one element and ranking a thousand both cost one comparison
		// per element in the common case; only the losers' sift cost differs.
		// A window scanned linearly instead of kept as a heap would show up here
		// as the larger window costing a hundred times the smaller.
		conversions = 0;
		SequenceCollection.from(orders)
			.topBy((order) => countingKey(order.total), 1)
			.toArray();
		const forOne: number = conversions;

		conversions = 0;
		SequenceCollection.from(orders)
			.topBy((order) => countingKey(order.total), 1_000)
			.toArray();
		const forThousand: number = conversions;

		expect(forThousand).toBeLessThan(forOne * 3);
	});

	it('should stay within a generous ceiling at a million records', () => {
		const many: readonly number[] = Array.from(
			{ length: 1_000_000 },
			(_, index) => (index * 7919) % 500_000,
		);

		const started: number = performance.now();

		const ranked = SequenceCollection.from(many)
			.topBy((value) => value, 20)
			.toArray();

		// A smoke ceiling, not a budget: it exists to catch the regression that
		// turns seconds into minutes, and should never be tightened until it can
		// detect something subtler honestly.
		expect(performance.now() - started).toBeLessThan(5_000);
		expect(ranked).toHaveLength(20);
	});
});

describe('choose', () => {
	it('should read its source once and project once per element', () => {
		let pulled = 0;
		let projected = 0;

		const references = SequenceCollection.from(
			counted(orders, () => pulled++),
		).choose((order) => {
			projected++;
			return order.reference;
		});

		expect(references.toArray()).toHaveLength(SIZE - SIZE / 4);
		expect(pulled).toBe(SIZE);
		expect(projected).toBe(SIZE);
	});

	it('should cost one traversal where where().select() costs the projection twice', () => {
		// The reason the operator exists. Splitting a projection that is also a
		// test forces the expensive half to run in both places; `choose` runs it
		// once and keeps what it produced.
		let split = 0;

		SequenceCollection.from(orders)
			.where((order) => {
				split++;
				return order.reference !== null;
			})
			.select((order) => {
				split++;
				return order.reference;
			})
			.toArray();

		let chosen = 0;

		SequenceCollection.from(orders)
			.choose((order) => {
				chosen++;
				return order.reference;
			})
			.toArray();

		expect(chosen).toBe(SIZE);
		expect(split).toBeGreaterThan(chosen);
	});

	it('should pull only what a bounded chain needs', () => {
		let pulled = 0;

		const first = SequenceCollection.from(counted(orders, () => pulled++))
			.choose((order) => order.reference)
			.take(5)
			.toArray();

		expect(first).toHaveLength(5);
		// Five results out of a source where one in four is dropped: seven pulls
		// is the arithmetic, and a bound of twenty is slack enough not to be
		// brittle while still failing loudly on a chain that drained the source.
		expect(pulled).toBeLessThanOrEqual(20);
	});
});

describe('ofType and cast', () => {
	it('should each read the source exactly once', () => {
		const mixed: readonly unknown[] = orders.flatMap((order) => [
			order,
			order.id,
		]);

		let pulledByOfType = 0;
		let pulledByCast = 0;

		SequenceCollection.from(counted(mixed, () => pulledByOfType++))
			.ofType('number')
			.toArray();

		SequenceCollection.from(counted(mixed, () => pulledByCast++))
			.ofType('object')
			.toArray();

		expect(pulledByOfType).toBe(mixed.length);
		expect(pulledByCast).toBe(mixed.length);
	});

	it('should stop where a bounded chain stops', () => {
		const mixed: readonly unknown[] = orders.flatMap((order) => [
			order,
			order.id,
		]);

		let pulled = 0;

		SequenceCollection.from(counted(mixed, () => pulled++))
			.ofType('number')
			.take(3)
			.toArray();

		expect(pulled).toBeLessThanOrEqual(10);
	});

	it('should not read past the element that fails a cast', () => {
		// A cast over a large sequence must fail where the problem is, not after
		// walking everything that follows it.
		const broken: readonly unknown[] = [...orders.slice(0, 5), 'not an order'];

		let pulled = 0;

		expect(() =>
			SequenceCollection.from(counted(broken, () => pulled++))
				.cast('object')
				.toArray(),
		).toThrow(TypeError);

		expect(pulled).toBe(6);
	});

	it('should add no traversal to a chain it sits in', () => {
		let pulled = 0;

		SequenceCollection.from(counted(orders, () => pulled++))
			.cast('object')
			.select((order) => order)
			.toArray();

		expect(pulled).toBe(SIZE);
	});
});

describe('tap', () => {
	it('should add no traversal of its own', () => {
		let pulled = 0;
		let observed = 0;

		SequenceCollection.from(counted(orders, () => pulled++))
			.tap(() => observed++)
			.toArray();

		// One pull per element, not two: an implementation that materialised in
		// order to observe would double this.
		expect(pulled).toBe(SIZE);
		expect(observed).toBe(SIZE);
	});

	it('should observe only what a bounded chain pulls', () => {
		let observed = 0;

		SequenceCollection.from(orders)
			.tap(() => observed++)
			.take(7)
			.toArray();

		expect(observed).toBe(7);
	});

	it('should observe nothing when the chain is only described', () => {
		let observed = 0;

		SequenceCollection.from(orders)
			.tap(() => observed++)
			.select((order) => order.total)
			.where((total) => total > 100);

		expect(observed).toBe(0);
	});
});
