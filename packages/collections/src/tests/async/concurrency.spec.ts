import { describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';

/**
 * Wraps a projection so the test can see how many ran at once.
 *
 * A concurrency test that only measures elapsed time passes on a sequential
 * implementation whenever the machine is fast enough, so the peak is counted
 * rather than inferred: entry increments, exit decrements, and the highest the
 * counter ever reached is what gets asserted.
 *
 * @param work Projection being watched.
 * @returns The wrapped projection and a reader of the peak.
 */
const watched = <T, R>(
	work: (value: T) => Promise<R>,
): { tracked: (value: T) => Promise<R>; peak: () => number } => {
	let running = 0;
	let peak = 0;

	return {
		tracked: async (value: T): Promise<R> => {
			running++;
			peak = Math.max(peak, running);

			try {
				return await work(value);
			} finally {
				running--;
			}
		},
		peak: () => peak,
	};
};

/**
 * Resolves after a number of microtask turns.
 *
 * Deliberately not a timer: these tests are about scheduling rather than
 * duration, and a suite that waits on real milliseconds gets slower with every
 * case added to it.
 *
 * @param turns How many turns to wait.
 * @returns A promise settling after that many turns.
 */
const turns = async (count: number): Promise<void> => {
	for (let turn = 0; turn < count; turn++) await Promise.resolve();
};

describe('selectAwait', () => {
	it('should never exceed the limit it was given', async () => {
		const { tracked, peak } = watched(async (value: number) => {
			await turns(5);
			return value;
		});

		await AsyncSequenceCollection.from([1, 2, 3, 4, 5, 6, 7, 8])
			.selectAwait(tracked, { concurrency: 3 })
			.toArray();

		expect(peak()).toBe(3);
	});

	it('should actually overlap rather than run one at a time', async () => {
		// The other half of the assertion above: a limit of 3 that only ever
		// reached 1 would satisfy "never exceeded" perfectly.
		const { tracked, peak } = watched(async (value: number) => {
			await turns(5);
			return value;
		});

		await AsyncSequenceCollection.from([1, 2, 3, 4])
			.selectAwait(tracked, { concurrency: 4 })
			.toArray();

		expect(peak()).toBeGreaterThan(1);
	});

	it('should keep input order even when durations are uneven', async () => {
		// Reversed durations, so an implementation handing results back as they
		// finish produces exactly the opposite order.
		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.selectAwait(
				async (value) => {
					await turns((5 - value) * 4);
					return value;
				},
				{ concurrency: 4 },
			)
			.toArray();

		expect(result).toEqual([1, 2, 3, 4]);
	});

	it('should hand results back as they finish when asked to', async () => {
		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.selectAwait(
				async (value) => {
					await turns((5 - value) * 4);
					return value;
				},
				{ concurrency: 4, ordered: false },
			)
			.toArray();

		expect(result).toEqual([4, 3, 2, 1]);
		expect([...result].sort()).toEqual([1, 2, 3, 4]);
	});

	it('should stop starting work once one rejects', async () => {
		let started = 0;

		const attempt = AsyncSequenceCollection.from([1, 2, 3, 4, 5, 6])
			.selectAwait(
				async (value) => {
					started++;
					await turns(2);

					if (value === 2) throw new Error('boom');

					return value;
				},
				{ concurrency: 2 },
			)
			.toArray();

		await expect(attempt).rejects.toThrow('boom');

		// Two were in flight when the second failed; nothing beyond them began.
		expect(started).toBeLessThanOrEqual(3);
	});

	it('should leave nothing running when it rejects', async () => {
		// Anything still in flight is awaited before the failure surfaces, so a
		// later rejection among them cannot surface as an unhandled one.
		let finished = 0;

		const attempt = AsyncSequenceCollection.from([1, 2, 3, 4])
			.selectAwait(
				async (value) => {
					await turns(value === 1 ? 1 : 8);

					if (value === 1) throw new Error('first');

					finished++;
					return value;
				},
				{ concurrency: 4 },
			)
			.toArray();

		await expect(attempt).rejects.toThrow('first');

		const settledAtRejection = finished;

		await turns(40);

		expect(finished).toBe(settledAtRejection);
	});

	it('should stay deferred', async () => {
		let called = 0;

		const query = AsyncSequenceCollection.from([1, 2, 3]).selectAwait(
			async (value) => {
				called++;
				return value;
			},
			{ concurrency: 2 },
		);

		expect(called).toBe(0);

		await query.toArray();

		expect(called).toBe(3);
	});

	it.each([0, -1, 1.5, Number.NaN])(
		'should reject a concurrency of %s where it was written',
		(concurrency) => {
			// Thrown at the call rather than on first iteration, so the mistake is
			// reported where it was made.
			expect(() =>
				AsyncSequenceCollection.from([1]).selectAwait(async (v) => v, {
					concurrency,
				}),
			).toThrow(/positive integer concurrency/i);
		},
	);

	it('should chain with the rest of the operators', async () => {
		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.selectAwait(async (value) => value * 10, { concurrency: 2 })
			.where((value) => value > 15)
			.toArray();

		expect(result).toEqual([20, 30, 40]);
	});
});

describe('whereAwait', () => {
	it('should keep the matching elements in order', async () => {
		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.whereAwait(async (value) => value % 2 === 0, { concurrency: 2 })
			.toArray();

		expect(result).toEqual([2, 4]);
	});

	it('should evaluate several conditions at once', async () => {
		const { tracked, peak } = watched(async (value: number) => {
			await turns(5);
			return value > 0;
		});

		await AsyncSequenceCollection.from([1, 2, 3, 4, 5, 6])
			.whereAwait(tracked, { concurrency: 3 })
			.toArray();

		expect(peak()).toBe(3);
	});

	it('should keep each element with its own verdict', async () => {
		// The pairing has to survive an unordered run, where results arrive
		// detached from the order they were judged in.
		const result = await AsyncSequenceCollection.from([1, 2, 3, 4])
			.whereAwait(
				async (value) => {
					await turns((5 - value) * 4);
					return value % 2 === 0;
				},
				{ concurrency: 4, ordered: false },
			)
			.toArray();

		expect([...result].sort()).toEqual([2, 4]);
	});

	it.each([0, -1])('should reject a concurrency of %s', (concurrency) => {
		expect(() =>
			AsyncSequenceCollection.from([1]).whereAwait(async () => true, {
				concurrency,
			}),
		).toThrow(/positive integer concurrency/i);
	});
});

describe('forEachAwait', () => {
	it('should run every action, several at a time', async () => {
		const seen: number[] = [];
		const { tracked, peak } = watched(async (value: number) => {
			await turns(4);
			seen.push(value);
			return value;
		});

		await AsyncSequenceCollection.from([1, 2, 3, 4, 5]).forEachAwait(
			async (value) => {
				await tracked(value);
			},
			{ concurrency: 2 },
		);

		expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
		expect(peak()).toBe(2);
	});

	it('should report the position in the source, not the finishing order', async () => {
		const pairs: [number, string][] = [];

		await AsyncSequenceCollection.from(['a', 'b', 'c']).forEachAwait(
			async (value, index) => {
				await turns(index === 0 ? 8 : 1);
				pairs.push([index, value]);
			},
			{ concurrency: 3 },
		);

		expect([...pairs].sort()).toEqual([
			[0, 'a'],
			[1, 'b'],
			[2, 'c'],
		]);
	});

	it('should reject when an action does', async () => {
		await expect(
			AsyncSequenceCollection.from([1, 2, 3]).forEachAwait(
				async (value) => {
					if (value === 2) throw new Error('write failed');
				},
				{ concurrency: 2 },
			),
		).rejects.toThrow('write failed');
	});

	it('should honour a cancellation signal', async () => {
		const controller = new AbortController();

		controller.abort();

		await expect(
			AsyncSequenceCollection.from([1, 2, 3]).forEachAwait(async () => {}, {
				concurrency: 2,
				signal: controller.signal,
			}),
		).rejects.toThrow();
	});
});
