import { beforeEach, describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';

/**
 * Performance suite for the asynchronous sequence and its concurrent
 * operators.
 *
 * Mostly counters, as everywhere else here: laziness, back pressure and early
 * termination are algorithmic guarantees, and a counter catches their loss by
 * orders of magnitude on any machine.
 *
 * The concurrency assertions are the exception, and deliberately. Overlapping
 * is only observable in the clock — but what is asserted is a *ratio*, not a
 * duration: a hundred waits of a millisecond finish in about a tenth of the
 * sequential time at a limit of ten. A machine being slow scales both sides.
 */

/** Volume used by the assertions counting work. */
const VOLUME = 10_000;

/** Elements pulled out of the instrumented source since the last reset. */
let pulled = 0;

beforeEach(() => {
	pulled = 0;
});

/**
 * Builds an asynchronous source that reports every element it hands over.
 *
 * @param size Amount of elements the source yields.
 * @returns The instrumented source.
 */
const instrumentedSource = (size: number): AsyncIterable<number> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<number> {
		for (let index = 0; index < size; index++) {
			pulled++;
			yield index;
		}
	},
});

/** A source that never ends, for proving an operator stops pulling. */
const endless = (): AsyncIterable<number> => ({
	async *[Symbol.asyncIterator](): AsyncIterator<number> {
		for (let index = 0; ; index++) {
			pulled++;
			yield index;
		}
	},
});

/**
 * Waits a real interval.
 *
 * Used only by the ratio assertions, where the point is that waiting overlaps.
 *
 * @param milliseconds How long to wait.
 * @returns A promise settling after that long.
 */
const delay = (milliseconds: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('laziness', () => {
	it('should pull nothing while a chain is only described', async () => {
		AsyncSequenceCollection.from(instrumentedSource(VOLUME))
			.where((value) => value > 1)
			.select((value) => value * 2)
			.take(5);

		expect(pulled).toBe(0);
	});

	it('should pull only what take asks for, on an endless source', async () => {
		await AsyncSequenceCollection.from(endless()).take(5).toArray();

		expect(pulled).toBe(5);
	});

	it('should stop first() and any() at the first element', async () => {
		await AsyncSequenceCollection.from(endless()).first();
		expect(pulled).toBe(1);

		pulled = 0;
		await AsyncSequenceCollection.from(endless()).any();
		expect(pulled).toBe(1);
	});

	it('should keep back pressure through a chain', async () => {
		// One element travels the whole chain before the next is asked for, which
		// is what stops a large source from being buffered.
		const chain = AsyncSequenceCollection.from(instrumentedSource(VOLUME))
			.select((value) => value * 2)
			.where((value) => value >= 0);

		let seen = 0;

		for await (const _ of chain) {
			seen++;
			expect(pulled).toBe(seen);

			if (seen === 3) break;
		}

		expect(pulled).toBe(3);
	});

	it('should stream chunks rather than collect the source first', async () => {
		let pulledAtFirstChunk = 0;

		for await (const chunk of AsyncSequenceCollection.from(
			instrumentedSource(VOLUME),
		).chunk(10)) {
			pulledAtFirstChunk = pulled;
			expect(chunk).toHaveLength(10);
			break;
		}

		expect(pulledAtFirstChunk).toBe(10);
	});
});

describe('single traversal', () => {
	it('should read the source exactly once per materialization', async () => {
		await AsyncSequenceCollection.from(instrumentedSource(VOLUME))
			.select((value) => value)
			.where(() => true)
			.toArray();

		expect(pulled).toBe(VOLUME);
	});

	it('should scale linearly rather than quadratically', async () => {
		await AsyncSequenceCollection.from(instrumentedSource(VOLUME))
			.select((value) => value)
			.select((value) => value)
			.select((value) => value)
			.toArray();

		// Three projections over one traversal, not one traversal per operator.
		expect(pulled).toBe(VOLUME);
	});
});

describe('concurrency actually overlaps', () => {
	it('should finish far sooner than the sequential equivalent', async () => {
		const items: readonly number[] = [...Array(40).keys()];

		const sequentialStart: number = performance.now();

		await AsyncSequenceCollection.from(items)
			.select(() => delay(5))
			.toArray();

		const sequential: number = performance.now() - sequentialStart;

		const concurrentStart: number = performance.now();

		await AsyncSequenceCollection.from(items)
			.selectAwait(() => delay(5), { concurrency: 10 })
			.toArray();

		const concurrent: number = performance.now() - concurrentStart;

		// A tenfold limit should cut it by roughly ten. Asserting a third is
		// generous enough to survive a loaded machine and still fail outright on
		// an implementation that quietly runs one at a time.
		expect(concurrent).toBeLessThan(sequential / 3);
	});

	it('should not exceed the limit it was given', async () => {
		let running = 0;
		let peak = 0;

		await AsyncSequenceCollection.from([...Array(50).keys()])
			.selectAwait(
				async (value) => {
					running++;
					peak = Math.max(peak, running);
					await delay(1);
					running--;
					return value;
				},
				{ concurrency: 6 },
			)
			.toArray();

		expect(peak).toBe(6);
	});

	it('should hold at most the limit in memory, not the sequence', async () => {
		// A limit of 4 over ten thousand elements must not pull ten thousand.
		let pulledAtFirstResult = 0;

		const results = AsyncSequenceCollection.from(
			instrumentedSource(VOLUME),
		).selectAwait(async (value) => value, { concurrency: 4 });

		for await (const _ of results) {
			pulledAtFirstResult = pulled;
			break;
		}

		expect(pulledAtFirstResult).toBeLessThanOrEqual(4);
	});

	it('should start no new work once one rejects', async () => {
		let started = 0;

		const attempt = AsyncSequenceCollection.from([...Array(VOLUME).keys()])
			.selectAwait(
				async (value) => {
					started++;

					if (value === 1) throw new Error('boom');

					return value;
				},
				{ concurrency: 2 },
			)
			.toArray();

		await expect(attempt).rejects.toThrow('boom');

		// A handful, not ten thousand.
		expect(started).toBeLessThan(10);
	});
});

describe('realistic records at volume', () => {
	/** The record the assertions below stream. */
	interface Reading {
		readonly sensorId: string;
		readonly takenAt: Date;
		readonly celsius: number;
		readonly tags: readonly string[];
	}

	/**
	 * Streams readings the way a cursor or a log would, one at a time.
	 *
	 * Built as it is pulled rather than up front, which is the shape this type
	 * exists for — the whole set is never in memory.
	 *
	 * @param size Amount of readings to produce.
	 * @returns The source.
	 */
	const readings = (size: number): AsyncIterable<Reading> => ({
		async *[Symbol.asyncIterator](): AsyncIterator<Reading> {
			for (let index = 0; index < size; index++) {
				pulled++;

				yield {
					sensorId: `sensor-${index % 500}`,
					takenAt: new Date(2024, 0, 1 + (index % 365)),
					celsius: (index % 60) - 10,
					tags: [`floor-${index % 12}`, index % 2 === 0 ? 'indoor' : 'outdoor'],
				};
			}
		},
	});

	it('should stream fifty thousand records without collecting them', async () => {
		const started: number = performance.now();

		const hot = await AsyncSequenceCollection.from(readings(50_000))
			.where((reading) => reading.celsius > 40)
			.select((reading) => reading.sensorId)
			.distinct()
			.toArray();

		expect(hot.length).toBeGreaterThan(0);
		expect(pulled).toBe(50_000);
		expect(performance.now() - started).toBeLessThan(5_000);
	});

	it('should batch records for writing without buffering the stream', async () => {
		let pulledAtFirstBatch = 0;
		let batches = 0;

		await AsyncSequenceCollection.from(readings(50_000))
			.select((reading) => ({
				...reading,
				fahrenheit: reading.celsius * 1.8 + 32,
			}))
			.chunk(500)
			.forEach((batch) => {
				if (batches === 0) pulledAtFirstBatch = pulled;

				batches++;
				expect(batch).toHaveLength(500);
			});

		expect(batches).toBe(100);
		// Five hundred, not fifty thousand.
		expect(pulledAtFirstBatch).toBe(500);
	});

	it('should flatten nested tags across the stream within budget', async () => {
		const started: number = performance.now();

		const tags = await AsyncSequenceCollection.from(readings(50_000))
			.selectMany((reading) => reading.tags)
			.toSet();

		expect(tags.size).toBe(14);
		expect(performance.now() - started).toBeLessThan(5_000);
	});

	it('should enrich records concurrently without pulling the whole stream', async () => {
		let pulledAtFirstResult = 0;

		const enriched = AsyncSequenceCollection.from(readings(50_000)).selectAwait(
			async (reading) => ({ ...reading, checked: true }),
			{ concurrency: 8 },
		);

		for await (const _ of enriched) {
			pulledAtFirstResult = pulled;
			break;
		}

		expect(pulledAtFirstResult).toBeLessThanOrEqual(8);
	});
});

describe('wall clock ceilings', () => {
	it('should traverse ten thousand elements within budget', async () => {
		const started: number = performance.now();

		const collected = await AsyncSequenceCollection.from(
			instrumentedSource(VOLUME),
		)
			.where((value) => value % 2 === 0)
			.select((value) => value * 2)
			.toArray();

		expect(collected).toHaveLength(VOLUME / 2);
		expect(performance.now() - started).toBeLessThan(2_000);
	});
});
