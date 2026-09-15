import { beforeEach, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Performance suite for the operators added beyond the original set.
 *
 * Same discipline as the suite beside it: cost is asserted through counters of
 * actual work rather than elapsed time. A counter encodes an algorithmic
 * guarantee — an operator that stops terminating early, or starts buffering
 * what it used to stream, breaks the expectation by orders of magnitude rather
 * than by a few percent, and does so on any machine.
 *
 * The wall clock assertions at the end are generous smoke ceilings against a
 * catastrophic regression, not measurements.
 */

/** Volume used by the assertions counting work. */
const VOLUME = 100_000;

/** Volume used by the assertions bounding elapsed time. */
const LARGE_VOLUME = 1_000_000;

/** Elements pulled out of the instrumented source since the last reset. */
let visits = 0;

/** Projections invoked by the instrumented selectors since the last reset. */
let projections = 0;

beforeEach(() => {
	visits = 0;
	projections = 0;
});

/**
 * Builds a source that reports every element handed to a consumer.
 *
 * Deliberately not an array: array fast paths would hide the traversals these
 * counters exist to observe.
 *
 * @param size Amount of elements the source yields.
 * @returns The instrumented source.
 */
const instrumentedSource = (size: number): Iterable<number> => ({
	*[Symbol.iterator](): Iterator<number> {
		for (let index = 0; index < size; index++) {
			visits++;
			yield index;
		}
	},
});

/**
 * Wraps a projection so that each of its invocations is counted.
 *
 * @template R Type produced by the projection.
 * @param projection Projection being instrumented.
 * @returns The instrumented projection.
 */
const counted =
	<R>(projection: (value: number) => R) =>
	(value: number): R => {
		projections++;
		return projection(value);
	};

describe('early termination', () => {
	it('should stop all() at the first counterexample', () => {
		SequenceCollection.from(instrumentedSource(VOLUME)).all(
			(value) => value < 3,
		);

		expect(visits).toBe(4);
	});

	it('should stop contains() at the match', () => {
		SequenceCollection.from(instrumentedSource(VOLUME)).contains(2);

		expect(visits).toBe(3);
	});

	it('should stop single() on the second match rather than draining', () => {
		// The failure must not cost a full traversal of a huge source.
		expect(() =>
			SequenceCollection.from(instrumentedSource(VOLUME)).single(),
		).toThrow();

		expect(visits).toBe(2);
	});

	it('should stop elementAt() at the position asked for', () => {
		SequenceCollection.from(instrumentedSource(VOLUME)).elementAt(9);

		expect(visits).toBe(10);
	});

	it('should stop sequenceEqual() at the first difference', () => {
		SequenceCollection.from(instrumentedSource(VOLUME)).sequenceEqual([0, 99]);

		expect(visits).toBe(2);
	});

	it('should stop takeWhile() at the element that failed', () => {
		SequenceCollection.from(instrumentedSource(VOLUME))
			.takeWhile((value) => value < 5)
			.toArray();

		expect(visits).toBe(6);
	});

	it('should not read the longer side of a zip past the pairing', () => {
		SequenceCollection.from(instrumentedSource(VOLUME))
			.zip([0, 1, 2], (left) => left)
			.toArray();

		// Four: three paired, and one that found no partner.
		expect(visits).toBe(4);
	});
});

describe('cardinality without traversal', () => {
	it('should answer the count of the new operators without pulling anything', () => {
		const numbers = SequenceCollection.from([...Array(VOLUME).keys()]);

		expect(numbers.concat([1, 2]).count()).toBe(VOLUME + 2);
		expect(numbers.append(1).count()).toBe(VOLUME + 1);
		expect(numbers.prepend(1).count()).toBe(VOLUME + 1);
		expect(numbers.takeLast(10).count()).toBe(10);
		expect(numbers.skipLast(10).count()).toBe(VOLUME - 10);
		expect(numbers.chunk(100).count()).toBe(VOLUME / 100);
		expect(numbers.reverse().count()).toBe(VOLUME);
		expect(numbers.defaultIfEmpty(0).count()).toBe(VOLUME);
		expect(numbers.windowed(10).count()).toBe(VOLUME - 9);
		expect(numbers.pairwise().count()).toBe(VOLUME - 1);
		expect(numbers.zip([1, 2], (left) => left).count()).toBe(2);

		expect(visits).toBe(0);
		expect(projections).toBe(0);
	});

	it('should generate nothing to count a range or a repeat', () => {
		expect(SequenceCollection.range(0, LARGE_VOLUME).count()).toBe(
			LARGE_VOLUME,
		);
		expect(SequenceCollection.repeat('x', LARGE_VOLUME).count()).toBe(
			LARGE_VOLUME,
		);
	});
});

describe('memory', () => {
	it('should hold only the window takeLast asks for', () => {
		// The guarantee that makes it usable on a source larger than memory: a
		// buffering implementation would pass every assertion about the values.
		const tail = SequenceCollection.from(instrumentedSource(VOLUME))
			.takeLast(5)
			.toArray();

		expect(tail).toEqual([
			VOLUME - 5,
			VOLUME - 4,
			VOLUME - 3,
			VOLUME - 2,
			VOLUME - 1,
		]);
		expect(visits).toBe(VOLUME);
	});

	it('should stream chunks rather than collect the sequence first', () => {
		let pulledWhenFirstChunkArrived = 0;

		const chunks = SequenceCollection.from(instrumentedSource(VOLUME)).chunk(
			10,
		);

		for (const chunk of chunks) {
			pulledWhenFirstChunkArrived = visits;
			expect(chunk).toHaveLength(10);
			break;
		}

		// Ten, not a hundred thousand.
		expect(pulledWhenFirstChunkArrived).toBe(10);
	});

	it('should buffer only the run in hand while grouping adjacent keys', () => {
		let pulledWhenFirstRunArrived = 0;

		const runs = SequenceCollection.from(instrumentedSource(VOLUME))
			.select((value) => Math.floor(value / 4))
			.groupAdjacent((key) => key);

		for (const run of runs) {
			pulledWhenFirstRunArrived = visits;
			expect(run.toArray()).toHaveLength(4);
			break;
		}

		// Five: four in the run, plus the one whose key ended it.
		expect(pulledWhenFirstRunArrived).toBe(5);
	});
});

describe('single traversal', () => {
	it('should read the source once for partition, where two filters read twice', () => {
		const source = SequenceCollection.from(instrumentedSource(VOLUME));

		source.partition(counted((value) => value % 2 === 0));

		expect(visits).toBe(VOLUME);
		expect(projections).toBe(VOLUME);
	});

	it('should invoke the key projection once per element in the *By operators', () => {
		const numbers = (): ReturnType<typeof SequenceCollection.from<number>> =>
			SequenceCollection.from(instrumentedSource(VOLUME));

		numbers()
			.distinctBy(counted((value) => value))
			.toArray();
		expect(projections).toBe(VOLUME);

		projections = 0;
		numbers().countBy(counted((value) => value % 10));
		expect(projections).toBe(VOLUME);

		projections = 0;
		numbers().minBy(counted((value) => value));
		expect(projections).toBe(VOLUME);
	});

	it('should index the inner side of a groupJoin once', () => {
		const outer = SequenceCollection.from([...Array(1_000).keys()]);
		const inner = [...Array(VOLUME).keys()];

		outer
			.groupJoin(
				inner,
				(value) => value % 100,
				counted((value) => value % 100),
				(value) => value,
			)
			.toArray();

		// One pass over the inner sequence, not one per outer element.
		expect(projections).toBe(VOLUME);
	});

	it('should accumulate scan in one pass', () => {
		SequenceCollection.from(instrumentedSource(VOLUME))
			.scan(0, (total, value) => total + value)
			.toArray();

		expect(visits).toBe(VOLUME);
	});
});

describe('memoize', () => {
	it('should pull the source once however many times it is read', () => {
		const kept = SequenceCollection.from(instrumentedSource(VOLUME)).memoize();

		kept.toArray();
		kept.toArray();
		kept.toArray();

		expect(visits).toBe(VOLUME);
	});

	it('should run the projections of its chain once', () => {
		const kept = SequenceCollection.from(instrumentedSource(VOLUME))
			.select(counted((value) => value * 2))
			.memoize();

		kept.toArray();
		kept.toArray();

		expect(projections).toBe(VOLUME);
	});

	it('should hold only what was actually consumed', () => {
		const kept = SequenceCollection.from(instrumentedSource(VOLUME)).memoize();

		kept.take(10).toArray();

		// Nothing beyond the tenth element was pulled, so nothing beyond it is
		// being held either.
		expect(visits).toBe(10);
	});
});

describe('wall clock ceilings', () => {
	it('should reverse a million elements within budget', () => {
		const started: number = performance.now();

		const reversed = SequenceCollection.range(0, LARGE_VOLUME)
			.reverse()
			.toArray();

		expect(reversed).toHaveLength(LARGE_VOLUME);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('should chunk a million elements within budget', () => {
		const started: number = performance.now();

		const chunks = SequenceCollection.range(0, LARGE_VOLUME)
			.chunk(1_000)
			.count();

		expect(chunks).toBe(1_000);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('should window a million elements within budget', () => {
		const started: number = performance.now();

		const windows = SequenceCollection.range(0, LARGE_VOLUME)
			.windowed(3)
			.count();

		expect(windows).toBe(LARGE_VOLUME - 2);
		expect(performance.now() - started).toBeLessThan(3_000);
	});

	it('should compute the statistics of a million values within budget', () => {
		const started: number = performance.now();
		const values = SequenceCollection.range(0, LARGE_VOLUME);

		expect(values.median()).toBeGreaterThan(0);
		expect(values.percentile(95)).toBeGreaterThan(0);
		expect(values.standardDeviation()).toBeGreaterThan(0);

		expect(performance.now() - started).toBeLessThan(5_000);
	});
});
