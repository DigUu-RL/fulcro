import { beforeAll, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Performance suite over a realistic dataset.
 *
 * The suites beside this one count work over sequences of numbers, which is
 * where an algorithmic guarantee is easiest to pin down. This one asks a
 * different question: what does the library cost on the shape of data it is
 * actually used for — records with several fields, nested arrays, dates and
 * strings, at a volume where an accidental quadratic stops being survivable.
 *
 * The distinction matters. A key projection over a number is free; one that
 * reads `order.customer.region` is not, and an operator that calls it twice per
 * comparison rather than once per element only shows up here.
 *
 * Wall clock budgets are generous, and set from what a linear implementation
 * comfortably achieves. They exist to catch a regression of the kind that turns
 * seconds into minutes.
 */

/** Orders built for the suite. */
const ORDERS = 100_000;

/** Customers the orders are spread across. */
const CUSTOMERS = 5_000;

/** Line items on every order. */
const ITEMS_PER_ORDER = 3;

/** A line on an order. */
interface LineItem {
	readonly sku: string;
	readonly quantity: number;
	readonly unitPrice: number;
}

/** The record the assertions below query. */
interface Order {
	readonly id: number;
	readonly customerId: number;
	readonly region: string;
	readonly status: 'pending' | 'paid' | 'shipped' | 'cancelled';
	readonly total: number;
	readonly placedAt: Date;
	readonly items: readonly LineItem[];
}

/** A customer, for the join assertions. */
interface Customer {
	readonly id: number;
	readonly name: string;
	readonly region: string;
}

/** Regions the dataset is spread across. */
const REGIONS = ['north', 'south', 'east', 'west'] as const;

/** Statuses the dataset is spread across. */
const STATUSES = ['pending', 'paid', 'shipped', 'cancelled'] as const;

let orders: readonly Order[] = [];
let customers: readonly Customer[] = [];

beforeAll(() => {
	// Built once. A dataset rebuilt per test would make every budget below a
	// measurement of the builder rather than of the operator.
	orders = Array.from({ length: ORDERS }, (_, index) => ({
		id: index,
		customerId: index % CUSTOMERS,
		region: REGIONS[index % REGIONS.length],
		status: STATUSES[index % STATUSES.length],
		total: (index % 997) + (index % 13) / 10,
		placedAt: new Date(2020, 0, 1 + (index % 1_000)),
		items: Array.from({ length: ITEMS_PER_ORDER }, (__, line) => ({
			sku: `SKU-${(index + line) % 5_000}`,
			quantity: (line % 4) + 1,
			unitPrice: ((index + line) % 200) + 0.99,
		})),
	}));

	customers = Array.from({ length: CUSTOMERS }, (_, index) => ({
		id: index,
		name: `customer-${index}`,
		region: REGIONS[index % REGIONS.length],
	}));
}, 60_000);

/** How many times the instrumented key projections ran. */
let keyReads = 0;

/**
 * A key projection that reports how often it was called.
 *
 * The point of most assertions here: a sort that stops caching its keys, or a
 * join that indexes its inner side per outer element, shows up as a change in
 * this number long before it shows up as a slower clock.
 *
 * @template R Type of the produced key.
 * @param projection Projection being instrumented.
 * @returns The instrumented projection.
 */
const countedKey =
	<R>(projection: (order: Order) => R) =>
	(order: Order): R => {
		keyReads++;
		return projection(order);
	};

describe('sorting records by their fields', () => {
	it('should read each sorting key once per element, not per comparison', () => {
		keyReads = 0;

		SequenceCollection.from(orders)
			.orderBy(countedKey((order) => order.region))
			.toArray();

		// Once per element. Per comparison would be n log n — about 1.7 million
		// here, seventeen times more.
		expect(keyReads).toBe(ORDERS);
	});

	it('should read each key once per criterion on a composite sort', () => {
		keyReads = 0;

		SequenceCollection.from(orders)
			.orderBy(countedKey((order) => order.region))
			.thenByDescending(countedKey((order) => order.total))
			.thenBy(countedKey((order) => order.placedAt.getTime()))
			.toArray();

		expect(keyReads).toBe(ORDERS * 3);
	});

	it('should sort a hundred thousand records within budget', () => {
		const started: number = performance.now();

		const sorted = SequenceCollection.from(orders)
			.orderBy((order) => order.region)
			.thenByDescending((order) => order.total)
			.toArray();

		expect(sorted).toHaveLength(ORDERS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('grouping and indexing records', () => {
	it('should read the grouping key once per element', () => {
		keyReads = 0;

		SequenceCollection.from(orders)
			.groupBy(countedKey((order) => order.customerId))
			.toArray();

		expect(keyReads).toBe(ORDERS);
	});

	it('should tally by key without collecting the records', () => {
		keyReads = 0;

		const byStatus = SequenceCollection.from(orders).countBy(
			countedKey((order) => order.status),
		);

		expect(keyReads).toBe(ORDERS);
		expect(byStatus.size).toBe(STATUSES.length);
		expect([...byStatus.values()].reduce((a, b) => a + b, 0)).toBe(ORDERS);
	});

	it('should build a lookup over a hundred thousand records within budget', () => {
		const started: number = performance.now();

		const byCustomer = SequenceCollection.from(orders).toLookup(
			(order) => order.customerId,
		);

		expect(byCustomer.size).toBe(CUSTOMERS);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('should keep one record per distinct key in a single pass', () => {
		keyReads = 0;

		const unique = SequenceCollection.from(orders)
			.distinctBy(countedKey((order) => order.customerId))
			.count();

		expect(unique).toBe(CUSTOMERS);
		expect(keyReads).toBe(ORDERS);
	});
});

describe('joining two large collections', () => {
	it('should index the inner side once rather than per outer element', () => {
		let innerKeyReads = 0;

		SequenceCollection.from(orders)
			.join(
				customers,
				(order) => order.customerId,
				(customer) => {
					innerKeyReads++;
					return customer.id;
				},
				(order, customer) => ({ order: order.id, customer: customer.name }),
			)
			.toArray();

		// One pass over the customers. Per order it would be five hundred
		// million reads.
		expect(innerKeyReads).toBe(CUSTOMERS);
	});

	it('should join a hundred thousand orders to five thousand customers within budget', () => {
		const started: number = performance.now();

		const joined = SequenceCollection.from(orders)
			.join(
				customers,
				(order) => order.customerId,
				(customer) => customer.id,
				(order, customer) => `${customer.name}:${order.id}`,
			)
			.count();

		expect(joined).toBe(ORDERS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should give every outer record its group without rescanning', () => {
		const started: number = performance.now();

		const grouped = SequenceCollection.from(customers)
			.groupJoin(
				orders,
				(customer) => customer.id,
				(order) => order.customerId,
				(customer, theirOrders) => ({
					customer: customer.name,
					count: theirOrders.count(),
				}),
			)
			.toArray();

		expect(grouped).toHaveLength(CUSTOMERS);
		expect(grouped[0].count).toBe(ORDERS / CUSTOMERS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('flattening nested data', () => {
	it('should flatten three hundred thousand line items within budget', () => {
		const started: number = performance.now();

		const lines = SequenceCollection.from(orders)
			.selectMany((order) => order.items)
			.count();

		expect(lines).toBe(ORDERS * ITEMS_PER_ORDER);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should aggregate over nested data in one traversal', () => {
		const started: number = performance.now();

		const revenue = SequenceCollection.from(orders)
			.selectMany((order) => order.items)
			.sum((item) => item.quantity * item.unitPrice);

		expect(revenue).toBeGreaterThan(0);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should count distinct SKUs across every line without holding them twice', () => {
		const started: number = performance.now();

		const skus = SequenceCollection.from(orders)
			.selectMany((order) => order.items)
			.select((item) => item.sku)
			.toSet();

		expect(skus.size).toBe(5_000);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('laziness on a realistic chain', () => {
	it('should stop a filtered lookup at the record it wanted', () => {
		keyReads = 0;

		const found = SequenceCollection.from(orders)
			.where((order) => {
				keyReads++;
				return order.status === 'shipped';
			})
			.first();

		expect(found.status).toBe('shipped');
		// The third order is the first shipped one; nothing beyond it was read.
		expect(keyReads).toBeLessThanOrEqual(4);
	});

	it('should take a page of results without sorting the rest away', () => {
		const started: number = performance.now();

		const page = SequenceCollection.from(orders)
			.where((order) => order.region === 'north')
			.orderByDescending((order) => order.total)
			.take(20)
			.toArray();

		expect(page).toHaveLength(20);
		expect(performance.now() - started).toBeLessThan(2_000);
	});
});

describe('statistics over a field of a hundred thousand records', () => {
	it('should compute the spread within budget', () => {
		const started: number = performance.now();
		const values = SequenceCollection.from(orders);

		expect(values.average((order) => order.total)).toBeGreaterThan(0);
		expect(values.median((order) => order.total)).toBeGreaterThan(0);
		expect(values.percentile(95, (order) => order.total)).toBeGreaterThan(0);
		expect(values.standardDeviation((order) => order.total)).toBeGreaterThan(0);

		expect(performance.now() - started).toBeLessThan(5_000);
	});

	it('should find the extreme record rather than the extreme value', () => {
		keyReads = 0;

		const dearest = SequenceCollection.from(orders).maxBy(
			countedKey((order) => order.total),
		);

		expect(dearest.id).toBeGreaterThanOrEqual(0);
		expect(keyReads).toBe(ORDERS);
	});
});

describe('memoize on an expensive projection', () => {
	it('should run a costly projection once across repeated reads', () => {
		let projections = 0;

		const enriched = SequenceCollection.from(orders)
			.select((order) => {
				projections++;
				return {
					id: order.id,
					value: order.items.reduce(
						(total, item) => total + item.quantity * item.unitPrice,
						0,
					),
				};
			})
			.memoize();

		enriched.count();
		enriched.toArray();
		enriched.sum((row) => row.value);

		expect(projections).toBe(ORDERS);
	});
});
