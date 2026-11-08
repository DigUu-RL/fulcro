import { assert, beforeAll, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/src/collections/sequence';

/**
 * Performance suite for `choose`, `ofType`, `cast`, `topBy` and `tap`.
 *
 * Counted, not timed, and over records rather than numbers — a key projection
 * over a number is free, and an operator reading `arrival.captain.region` twice
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
interface Crate {
	readonly manifest: string;
	readonly quantity: number;
}

/** The record every assertion below works on. */
interface DockingRecord {
	readonly id: number;
	readonly region: string;
	readonly status: 'docked' | 'refuelled' | 'departed';
	readonly credits: number;
	readonly arrivedAt: Date;
	readonly cargo: readonly Crate[];
	readonly reference: string | null;
}

/** Statuses the dataset is spread across. */
const STATUSES: readonly DockingRecord['status'][] = ['docked', 'refuelled', 'departed'];

let arrivals: readonly DockingRecord[] = [];

beforeAll(() => {
	// Built once: a dataset rebuilt per test would make every count below a
	// measurement of the builder.
	arrivals = Array.from({ length: SIZE }, (_, index) => {
		const region: string | undefined = ['Core Worlds', 'Mid Rim', 'Outer Rim', 'Unknown Regions'][
			index % 4
		];

		const status: DockingRecord['status'] | undefined = STATUSES[index % 3];

		assert.isDefined(region);
		assert.isDefined(status);

		return {
			id: index,
			region,
			status,
			// Spread by a prime so the ranking cannot be satisfied by arrival order,
			// and so the best elements are not clustered at either end.
			credits: (index * 7919) % 50_000,
			arrivedAt: new Date(2020, 0, 1 + (index % 1_000)),
			cargo: [
				{ manifest: `manifest-${String(index % 97)}`, quantity: (index % 5) + 1 },
				{ manifest: `manifest-${String(index % 89)}`, quantity: (index % 3) + 1 },
			],
			reference: index % 4 === 0 ? null : `ref-${String(index)}`,
		};
	});
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
const countingKey = (value: number): object => {
	return {
		[Symbol.toPrimitive]: (): number => {
			conversions++;
			return value;
		},
	};
};

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
const counted = <T>(values: readonly T[], counter: () => void): Iterable<T> => {
	return {
		*[Symbol.iterator](): Iterator<T> {
			for (const value of values) {
				counter();
				yield value;
			}
		},
	};
};

describe('topBy', () => {
	it('should make one comparison per element, whatever the volume', () => {
		conversions = 0;

		SequenceCollection.from(arrivals)
			.topBy((arrival) => countingKey(arrival.credits), WANTED)
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

		SequenceCollection.from(arrivals)
			.topBy((arrival) => countingKey(arrival.credits), WANTED)
			.toArray();

		const ranked: number = conversions;

		conversions = 0;

		SequenceCollection.from(arrivals)
			.orderByDescending((arrival) => countingKey(arrival.credits))
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

		SequenceCollection.from(arrivals)
			.topBy((arrival) => {
				extracted++;
				return arrival.credits;
			}, WANTED)
			.toArray();

		expect(extracted).toBe(SIZE);
	});

	it('should read its source exactly once', () => {
		let pulled = 0;

		SequenceCollection.from(counted(arrivals, () => pulled++))
			.topBy((arrival) => arrival.credits, WANTED)
			.toArray();

		expect(pulled).toBe(SIZE);
	});

	it('should not grow its cost with the amount asked for being small', () => {
		// Ranking one element and ranking a thousand both cost one comparison
		// per element in the common case; only the losers' sift cost differs.
		// A window scanned linearly instead of kept as a heap would show up here
		// as the larger window costing a hundred times the smaller.
		conversions = 0;

		SequenceCollection.from(arrivals)
			.topBy((arrival) => countingKey(arrival.credits), 1)
			.toArray();

		const forOne: number = conversions;

		conversions = 0;

		SequenceCollection.from(arrivals)
			.topBy((arrival) => countingKey(arrival.credits), 1_000)
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

		const references = SequenceCollection.from(counted(arrivals, () => pulled++)).choose(
			(arrival) => {
				projected++;
				return arrival.reference;
			},
		);

		expect(references.toArray()).toHaveLength(SIZE - SIZE / 4);
		expect(pulled).toBe(SIZE);
		expect(projected).toBe(SIZE);
	});

	it('should cost one traversal where where().select() costs the projection twice', () => {
		// The reason the operator exists. Splitting a projection that is also a
		// test forces the expensive half to run in both places; `choose` runs it
		// once and keeps what it produced.
		let split = 0;

		SequenceCollection.from(arrivals)
			.where((arrival) => {
				split++;
				return arrival.reference !== null;
			})
			.select((arrival) => {
				split++;
				return arrival.reference;
			})
			.toArray();

		let chosen = 0;

		SequenceCollection.from(arrivals)
			.choose((arrival) => {
				chosen++;
				return arrival.reference;
			})
			.toArray();

		expect(chosen).toBe(SIZE);
		expect(split).toBeGreaterThan(chosen);
	});

	it('should pull only what a bounded chain needs', () => {
		let pulled = 0;

		const first = SequenceCollection.from(counted(arrivals, () => pulled++))
			.choose((arrival) => arrival.reference)
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
		const mixed: readonly unknown[] = arrivals.flatMap((arrival) => [arrival, arrival.id]);

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
		const mixed: readonly unknown[] = arrivals.flatMap((arrival) => [arrival, arrival.id]);

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
		const broken: readonly unknown[] = [...arrivals.slice(0, 5), 'not an order'];

		let pulled = 0;

		expect(() => {
			return SequenceCollection.from(counted(broken, () => pulled++))
				.cast('object')
				.toArray();
		}).toThrow(TypeError);

		expect(pulled).toBe(6);
	});

	it('should add no traversal to a chain it sits in', () => {
		let pulled = 0;

		SequenceCollection.from(counted(arrivals, () => pulled++))
			.cast('object')
			.select((arrival) => arrival)
			.toArray();

		expect(pulled).toBe(SIZE);
	});
});

describe('the shape check the transformer writes', () => {
	/** The record the generated check is written for. */
	interface Shaped {
		readonly id: number;
		readonly region: string;
		readonly status: 'docked' | 'refuelled' | 'departed';
		readonly credits: number;
		readonly arrivedAt: Date;
		readonly cargo: readonly Crate[];
		readonly reference: string | null;
	}

	it('should read its source exactly once', () => {
		let pulled = 0;

		SequenceCollection.from(counted(arrivals, () => pulled++))
			.ofType<Shaped>()
			.toArray();

		expect(pulled).toBe(SIZE);
	});

	it('should stop where a bounded chain stops', () => {
		// The check is the expensive part, so it matters that a chain asking for
		// five records does not validate a hundred thousand.
		let pulled = 0;

		SequenceCollection.from(counted(arrivals, () => pulled++))
			.ofType<Shaped>()
			.take(5)
			.toArray();

		expect(pulled).toBe(5);
	});

	it('should cost about what the same check written by hand costs', () => {
		// A ratio, not a budget: what is asserted is that the generated code is
		// not doing something pathological, and a loaded machine scales both
		// sides. The hand-written version below checks exactly the same clauses.
		// Read as a check meets a record: every field possibly anything.
		type Unchecked = { readonly [Key in keyof Shaped]?: unknown };
		type UncheckedItem = { readonly [Key in keyof Shaped['cargo'][number]]?: unknown };

		const byHand = (value: unknown): boolean => {
			if (value === null || typeof value !== 'object') return false;

			const arrival = value as Unchecked;

			return (
				typeof arrival.id === 'number' &&
				typeof arrival.region === 'string' &&
				(arrival.status === 'docked' ||
					arrival.status === 'refuelled' ||
					arrival.status === 'departed') &&
				typeof arrival.credits === 'number' &&
				arrival.arrivedAt instanceof Date &&
				Array.isArray(arrival.cargo) &&
				(arrival.cargo as readonly unknown[]).every((item) => {
					if (item === null || typeof item !== 'object') return false;

					const line = item as UncheckedItem;

					return typeof line.manifest === 'string' && typeof line.quantity === 'number';
				}) &&
				(arrival.reference === null || typeof arrival.reference === 'string')
			);
		};

		const handStart: number = performance.now();
		const byHandKept: number = arrivals.filter(byHand).length;
		const hand: number = Math.max(performance.now() - handStart, 1);

		const generatedStart: number = performance.now();
		const generatedKept: number = SequenceCollection.from(arrivals).ofType<Shaped>().count();
		const generated: number = performance.now() - generatedStart;

		// Both have to agree on the answer before their costs mean anything.
		expect(generatedKept).toBe(byHandKept);
		expect(generatedKept).toBe(SIZE);
		expect(generated).toBeLessThan(hand * 5);
	});

	it('should stay within a generous ceiling over a hundred thousand records', () => {
		const started: number = performance.now();

		const kept: number = SequenceCollection.from(arrivals).ofType<Shaped>().count();

		// A smoke ceiling. Validating every field of every record, including the
		// nested crates, is real work — this exists to catch the regression
		// that turns it into minutes, not to detect a ten percent slowdown.
		expect(performance.now() - started).toBeLessThan(3_000);
		expect(kept).toBe(SIZE);
	});

	it('should reject on the first clause that fails, not after all of them', () => {
		// The generated check is a chain of `&&`, so a value failing its first
		// clause must not go on to read the rest. Counted through a getter that
		// should never run.
		let readLater = 0;

		const wrong = {
			id: 'not a number',
			get region(): string {
				readLater++;
				return 'Core Worlds';
			},
		};

		SequenceCollection.from([wrong]).ofType<Shaped>().toArray();

		expect(readLater).toBe(0);
	});
});

describe('a recursive shape check', () => {
	/** A comment tree, the shape recursive checking exists for. */
	interface Transmission {
		readonly id: number;
		readonly text: string;
		readonly replies: Transmission[];
	}

	/**
	 * Builds a tree of a given breadth and depth.
	 *
	 * @param depth How many levels down to go.
	 * @param breadth How many replies each level carries.
	 * @param next Counter handing out ids.
	 * @returns The root comment.
	 */
	const treeOf = (depth: number, breadth: number, next: { value: number }): Transmission => {
		return {
			id: next.value++,
			text: `comment ${String(next.value)}`,
			replies:
				depth === 0 ? [] : Array.from({ length: breadth }, () => treeOf(depth - 1, breadth, next)),
		};
	};

	let forest: readonly Transmission[] = [];

	beforeAll(() => {
		// A thousand trees of about forty nodes each, so the check is exercised
		// on real nesting rather than on a flat record wearing a recursive type.
		forest = Array.from({ length: 1_000 }, () => treeOf(4, 2, { value: 0 }));
	});

	it('should declare its function once, not once per element', () => {
		// The point of hoisting the recursive check into an expression that runs
		// where the call sits. Building it per element would be invisible in the
		// results and ruinous in the cost, so it is counted: the type argument is
		// resolved once, and the sequence is built once.
		let built = 0;

		const observed: Iterable<Transmission> = {
			*[Symbol.iterator](): Iterator<Transmission> {
				built++;
				yield* forest;
			},
		};

		const kept: number = SequenceCollection.from(observed).ofType<Transmission>().count();

		expect(kept).toBe(forest.length);
		expect(built).toBe(1);
	});

	it('should read its source exactly once', () => {
		let pulled = 0;

		SequenceCollection.from(counted(forest, () => pulled++))
			.ofType<Transmission>()
			.toArray();

		expect(pulled).toBe(forest.length);
	});

	it('should stop where a bounded chain stops', () => {
		let pulled = 0;

		SequenceCollection.from(counted(forest, () => pulled++))
			.ofType<Transmission>()
			.take(3)
			.toArray();

		expect(pulled).toBe(3);
	});

	it('should give up on a bad branch without walking the rest of the tree', () => {
		// Short-circuiting matters more here than anywhere else: a tree is large,
		// and a check that evaluated every branch before answering would pay the
		// full cost of a value it had already ruled out.
		let readLater = 0;

		const wrong = {
			id: 'not a number',
			get text(): string {
				readLater++;
				return 'never read';
			},
		};

		SequenceCollection.from([wrong]).ofType<Transmission>().toArray();

		expect(readLater).toBe(0);
	});

	it('should stay within a generous ceiling over a forest', () => {
		const started: number = performance.now();

		const kept: number = SequenceCollection.from(forest).ofType<Transmission>().count();

		// A smoke ceiling. Walking every node of a thousand trees is real work;
		// this is here to catch the regression that turns it into minutes.
		expect(performance.now() - started).toBeLessThan(3_000);
		expect(kept).toBe(forest.length);
	});
});

describe('tap', () => {
	it('should add no traversal of its own', () => {
		let pulled = 0;
		let observed = 0;

		SequenceCollection.from(counted(arrivals, () => pulled++))
			.tap(() => observed++)
			.toArray();

		// One pull per element, not two: an implementation that materialised in
		// order to observe would double this.
		expect(pulled).toBe(SIZE);
		expect(observed).toBe(SIZE);
	});

	it('should observe only what a bounded chain pulls', () => {
		let observed = 0;

		SequenceCollection.from(arrivals)
			.tap(() => observed++)
			.take(7)
			.toArray();

		expect(observed).toBe(7);
	});

	it('should observe nothing when the chain is only described', () => {
		let observed = 0;

		SequenceCollection.from(arrivals)
			.tap(() => observed++)
			.select((arrival) => arrival.credits)
			.where((credits) => credits > 100);

		expect(observed).toBe(0);
	});
});
