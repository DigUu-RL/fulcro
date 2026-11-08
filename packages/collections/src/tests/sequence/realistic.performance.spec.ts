import { assert, beforeAll, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/src/collections/sequence';

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
 * reads `arrival.captain.region` is not, and an operator that calls it twice per
 * comparison rather than once per element only shows up here.
 *
 * Wall clock budgets are generous, and set from what a linear implementation
 * comfortably achieves. They exist to catch a regression of the kind that turns
 * seconds into minutes.
 */

/** Orders built for the suite. */
const ARRIVALS = 100_000;

/** Captains the arrivals are spread across. */
const CAPTAINS = 5_000;

/** Crates on every arrival. */
const CRATES_PER_ARRIVAL = 3;

/** A line on an order. */
interface Crate {
	readonly manifest: string;
	readonly quantity: number;
	readonly unitCredits: number;
}

/** The record the assertions below query. */
interface DockingRecord {
	readonly id: number;
	readonly captainId: number;
	readonly region: string;
	readonly status: 'docked' | 'refuelled' | 'departed' | 'impounded';
	readonly credits: number;
	readonly arrivedAt: Date;
	readonly cargo: readonly Crate[];
}

/** A captain, for the join assertions. */
interface Captain {
	readonly id: number;
	readonly name: string;
	readonly region: string;
}

/** Regions the dataset is spread across. */
const REGIONS = ['Core Worlds', 'Mid Rim', 'Outer Rim', 'Unknown Regions'] as const;

/** Statuses the dataset is spread across. */
const STATUSES = ['docked', 'refuelled', 'departed', 'impounded'] as const;

type Region = (typeof REGIONS)[number];
type Status = (typeof STATUSES)[number];

let arrivals: readonly DockingRecord[] = [];
let captains: readonly Captain[] = [];

beforeAll(() => {
	// Built once. A dataset rebuilt per test would make every budget below a
	// measurement of the builder rather than of the operator.
	arrivals = Array.from({ length: ARRIVALS }, (_, index) => {
		const region: Region | undefined = REGIONS[index % REGIONS.length];
		const status: Status | undefined = STATUSES[index % STATUSES.length];

		assert.isDefined(region);
		assert.isDefined(status);

		return {
			id: index,
			captainId: index % CAPTAINS,
			region,
			status,
			credits: (index % 997) + (index % 13) / 10,
			arrivedAt: new Date(2020, 0, 1 + (index % 1_000)),
			cargo: Array.from({ length: CRATES_PER_ARRIVAL }, (_slot, line) => {
				return {
					manifest: `CRATE-${String((index + line) % 5_000)}`,
					quantity: (line % 4) + 1,
					unitCredits: ((index + line) % 200) + 0.99,
				};
			}),
		};
	});

	captains = Array.from({ length: CAPTAINS }, (_, index) => {
		const region: Region | undefined = REGIONS[index % REGIONS.length];

		assert.isDefined(region);

		return {
			id: index,
			name: `captain-${String(index)}`,
			region,
		};
	});
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
const countedKey = <R>(projection: (arrival: DockingRecord) => R) => {
	return (arrival: DockingRecord): R => {
		keyReads++;
		return projection(arrival);
	};
};

describe('sorting records by their fields', () => {
	it('should read each sorting key once per element, not per comparison', () => {
		keyReads = 0;

		SequenceCollection.from(arrivals)
			.orderBy(countedKey((arrival) => arrival.region))
			.toArray();

		// Once per element. Per comparison would be n log n — about 1.7 million
		// here, seventeen times more.
		expect(keyReads).toBe(ARRIVALS);
	});

	it('should read each key once per criterion on a composite sort', () => {
		keyReads = 0;

		SequenceCollection.from(arrivals)
			.orderBy(countedKey((arrival) => arrival.region))
			.thenByDescending(countedKey((arrival) => arrival.credits))
			.thenBy(countedKey((arrival) => arrival.arrivedAt.getTime()))
			.toArray();

		expect(keyReads).toBe(ARRIVALS * 3);
	});

	it('should sort a hundred thousand records within budget', () => {
		const started: number = performance.now();

		const sorted = SequenceCollection.from(arrivals)
			.orderBy((arrival) => arrival.region)
			.thenByDescending((arrival) => arrival.credits)
			.toArray();

		expect(sorted).toHaveLength(ARRIVALS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('grouping and indexing records', () => {
	it('should read the grouping key once per element', () => {
		keyReads = 0;

		SequenceCollection.from(arrivals)
			.groupBy(countedKey((arrival) => arrival.captainId))
			.toArray();

		expect(keyReads).toBe(ARRIVALS);
	});

	it('should tally by key without collecting the records', () => {
		keyReads = 0;

		const byStatus = SequenceCollection.from(arrivals).countBy(
			countedKey((arrival) => arrival.status),
		);

		expect(keyReads).toBe(ARRIVALS);
		expect(byStatus.size).toBe(STATUSES.length);
		expect([...byStatus.values()].reduce((left, right) => left + right, 0)).toBe(ARRIVALS);
	});

	it('should build a lookup over a hundred thousand records within budget', () => {
		const started: number = performance.now();

		const byCaptain = SequenceCollection.from(arrivals).toLookup((arrival) => arrival.captainId);

		expect(byCaptain.size).toBe(CAPTAINS);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('should keep one record per distinct key in a single pass', () => {
		keyReads = 0;

		const unique = SequenceCollection.from(arrivals)
			.distinctBy(countedKey((arrival) => arrival.captainId))
			.count();

		expect(unique).toBe(CAPTAINS);
		expect(keyReads).toBe(ARRIVALS);
	});
});

describe('joining two large collections', () => {
	it('should index the inner side once rather than per outer element', () => {
		let innerKeyReads = 0;

		SequenceCollection.from(arrivals)
			.join(
				captains,
				(arrival) => arrival.captainId,
				(captain) => {
					innerKeyReads++;
					return captain.id;
				},
				(arrival, captain) => ({ arrival: arrival.id, captain: captain.name }),
			)
			.toArray();

		// One pass over the captains. Per order it would be five hundred
		// million reads.
		expect(innerKeyReads).toBe(CAPTAINS);
	});

	it('should join a hundred thousand arrivals to five thousand captains within budget', () => {
		const started: number = performance.now();

		const joined = SequenceCollection.from(arrivals)
			.join(
				captains,
				(arrival) => arrival.captainId,
				(captain) => captain.id,
				(arrival, captain) => `${captain.name}:${String(arrival.id)}`,
			)
			.count();

		expect(joined).toBe(ARRIVALS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should give every outer record its group without rescanning', () => {
		const started: number = performance.now();

		const grouped = SequenceCollection.from(captains)
			.groupJoin(
				arrivals,
				(captain) => captain.id,
				(arrival) => arrival.captainId,
				(captain, theirArrivals) => {
					return {
						captain: captain.name,
						count: theirArrivals.count(),
					};
				},
			)
			.toArray();

		expect(grouped).toHaveLength(CAPTAINS);
		expect(grouped[0]?.count).toBe(ARRIVALS / CAPTAINS);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('flattening nested data', () => {
	it('should flatten three hundred thousand line cargo within budget', () => {
		const started: number = performance.now();

		const lines = SequenceCollection.from(arrivals)
			.selectMany((arrival) => arrival.cargo)
			.count();

		expect(lines).toBe(ARRIVALS * CRATES_PER_ARRIVAL);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should aggregate over nested data in one traversal', () => {
		const started: number = performance.now();

		const revenue = SequenceCollection.from(arrivals)
			.selectMany((arrival) => arrival.cargo)
			.sum((item) => item.quantity * item.unitCredits);

		expect(revenue).toBeGreaterThan(0);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should count distinct SKUs across every line without holding them twice', () => {
		const started: number = performance.now();

		const skus = SequenceCollection.from(arrivals)
			.selectMany((arrival) => arrival.cargo)
			.select((item) => item.manifest)
			.toSet();

		expect(skus.size).toBe(5_000);
		expect(performance.now() - started).toBeLessThan(3_000);
	});
});

describe('laziness on a realistic chain', () => {
	it('should stop a filtered lookup at the record it wanted', () => {
		keyReads = 0;

		const found = SequenceCollection.from(arrivals)
			.where((arrival) => {
				keyReads++;
				return arrival.status === 'departed';
			})
			.first();

		expect(found.status).toBe('departed');
		// The third order is the first shipped one; nothing beyond it was read.
		expect(keyReads).toBeLessThanOrEqual(4);
	});

	it('should take a page of results without sorting the rest away', () => {
		const started: number = performance.now();

		const page = SequenceCollection.from(arrivals)
			.where((arrival) => arrival.region === 'Core Worlds')
			.orderByDescending((arrival) => arrival.credits)
			.take(20)
			.toArray();

		expect(page).toHaveLength(20);
		expect(performance.now() - started).toBeLessThan(2_000);
	});
});

describe('statistics over a field of a hundred thousand records', () => {
	it('should compute the spread within budget', () => {
		const started: number = performance.now();
		const values = SequenceCollection.from(arrivals);

		expect(values.average((arrival) => arrival.credits)).toBeGreaterThan(0);
		expect(values.median((arrival) => arrival.credits)).toBeGreaterThan(0);
		expect(values.percentile(95, (arrival) => arrival.credits)).toBeGreaterThan(0);
		expect(values.standardDeviation((arrival) => arrival.credits)).toBeGreaterThan(0);

		expect(performance.now() - started).toBeLessThan(5_000);
	});

	it('should find the extreme record rather than the extreme value', () => {
		keyReads = 0;

		const dearest = SequenceCollection.from(arrivals).maxBy(
			countedKey((arrival) => arrival.credits),
		);

		expect(dearest.id).toBeGreaterThanOrEqual(0);
		expect(keyReads).toBe(ARRIVALS);
	});
});

describe('memoize on an expensive projection', () => {
	it('should run a costly projection once across repeated reads', () => {
		let projections = 0;

		const enriched = SequenceCollection.from(arrivals)
			.select((arrival) => {
				projections++;
				return {
					id: arrival.id,
					value: arrival.cargo.reduce(
						(credits, item) => credits + item.quantity * item.unitCredits,
						0,
					),
				};
			})
			.memoize();

		enriched.count();
		enriched.toArray();
		enriched.sum((row) => row.value);

		expect(projections).toBe(ARRIVALS);
	});
});
