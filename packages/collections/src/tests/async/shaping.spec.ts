import { describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';
import { SequenceCollection } from '@/collections/sequence';

/**
 * Behavior suite for the shaping operators on the asynchronous sequence:
 * `choose`, `ofType`, `cast`, `topBy` and `tap`.
 *
 * These are not the synchronous operators wrapped in `async`, and the tests are
 * written around the two things that makes different. **Back pressure**: the
 * plain forms pull one element at a time, so an operator that raced ahead of
 * what was consumed would defeat the reason this type exists. And **bounded
 * memory**: `topBy` ranks a stream without collecting it, which is only true if
 * what it holds never grows past the window.
 *
 * Neither shows up in the values that come out, so most of these read a counter
 * rather than only the result.
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

describe('choose', () => {
	it('should keep what the projection produced and drop what it did not', async () => {
		const values = AsyncSequenceCollection.from(
			streamOf([
				{ email: 'a@b.c' },
				{ email: null },
				{ email: 'c@d.e' },
			] as readonly { email: string | null }[]),
		).choose((user) => user.email);

		expect(await values.toArray()).toEqual(['a@b.c', 'c@d.e']);
	});

	it('should await a projection that has to wait', async () => {
		const values = AsyncSequenceCollection.from(streamOf([1, 2, 3])).choose(
			async (value) => {
				await Promise.resolve();
				return value % 2 === 0 ? value : null;
			},
		);

		expect(await values.toArray()).toEqual([2]);
	});

	it('should treat falsy values as results, not as absence', async () => {
		const values = AsyncSequenceCollection.from(streamOf([1, 2, 3])).choose(
			(value) => (value === 2 ? null : 0),
		);

		expect(await values.toArray()).toEqual([0, 0]);
	});

	it('should pull one element at a time', async () => {
		const { source, pulled } = counted([1, 2, 3, 4, 5]);

		const first = await AsyncSequenceCollection.from(source)
			.choose((value) => value)
			.take(2)
			.toArray();

		expect(first).toEqual([1, 2]);
		expect(pulled()).toBeLessThanOrEqual(3);
	});

	it('should run several projections at once with chooseAwait', async () => {
		let running = 0;
		let peak = 0;

		const values = AsyncSequenceCollection.from(
			streamOf([...Array(12).keys()]),
		).chooseAwait(
			async (value) => {
				running++;
				peak = Math.max(peak, running);
				await new Promise((resolve) => setTimeout(resolve, 5));
				running--;

				return value % 2 === 0 ? value : null;
			},
			{ concurrency: 4 },
		);

		expect(await values.toArray()).toEqual([0, 2, 4, 6, 8, 10]);

		// Both directions. An implementation that never overlapped would sit at
		// one and satisfy an upper bound on its own.
		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(4);
	});

	it('should count projections in flight, not results kept', async () => {
		// Dropping a result must not free a slot, or the limit would quietly
		// depend on how much the projection discards.
		let running = 0;
		let peak = 0;

		await AsyncSequenceCollection.from([...Array(20).keys()])
			.chooseAwait(
				async (value) => {
					running++;
					peak = Math.max(peak, running);
					await new Promise((resolve) => setTimeout(resolve, 2));
					running--;

					return value === 0 ? value : null;
				},
				{ concurrency: 3 },
			)
			.toArray();

		expect(peak).toBeLessThanOrEqual(3);
	});

	it.each([0, -1, 1.5])('should reject a concurrency of %s', (concurrency) => {
		expect(() =>
			AsyncSequenceCollection.from(streamOf([1])).chooseAwait(
				(value) => value,
				{ concurrency },
			),
		).toThrow(/positive integer/i);
	});
});

describe('ofType and cast', () => {
	it('should keep only the elements of a type', async () => {
		const values: unknown[] = ['a', 1, 'b', null];

		const strings = AsyncSequenceCollection.from(streamOf(values)).ofType(
			'string',
		);

		expect(await strings.toArray()).toEqual(['a', 'b']);
	});

	it('should throw at the element that fails, without reading the rest', async () => {
		// The point of checking a stream as it arrives: a bad page is caught
		// without the remainder of the feed being fetched.
		const { source, pulled } = counted<unknown>(['a', 'b', 7, 'c', 'd']);

		await expect(
			AsyncSequenceCollection.from(source).cast('string').toArray(),
		).rejects.toThrow(/cast\('string'\) found a number at index 2/);

		expect(pulled()).toBe(3);
	});

	it('should not check past where a bounded chain stops', async () => {
		const values: unknown[] = ['a', 'b', 7];

		const firstTwo = await AsyncSequenceCollection.from(streamOf(values))
			.cast('string')
			.take(2)
			.toArray();

		expect(firstTwo).toEqual(['a', 'b']);
	});

	it('should accept a shape test written by hand', async () => {
		const values: unknown[] = [{ id: 1 }, { id: 'x' }, 'neither'];

		const kept = AsyncSequenceCollection.from(streamOf(values)).ofType<{
			id: number;
		}>({
			name: 'Account',
			matches: (value) =>
				value !== null &&
				typeof value === 'object' &&
				typeof (value as { id: unknown }).id === 'number',
		});

		expect(await kept.toArray()).toEqual([{ id: 1 }]);
	});

	it('should refuse an unresolved type argument before reading anything', async () => {
		const { source, pulled } = counted<unknown>([1, 2, 3]);

		expect(() =>
			(
				AsyncSequenceCollection.from(source) as unknown as {
					ofType: () => unknown;
				}
			).ofType(),
		).toThrow(/was not resolved at compile time/);

		expect(pulled()).toBe(0);
	});
});

describe('topBy', () => {
	it('should return the largest keys, largest first', async () => {
		const best = AsyncSequenceCollection.from(
			streamOf([3, 1, 4, 1, 5, 9, 2, 6]),
		).topBy((value) => value, 3);

		expect(await best.toArray()).toEqual([9, 6, 5]);
	});

	it('should agree with the synchronous operator, ties included', async () => {
		// The two share one window implementation precisely so this holds. The
		// dataset is mostly ties, which is where two heaps would disagree.
		const players = Array.from({ length: 500 }, (_, index) => ({
			name: `player-${index}`,
			score: index % 7,
		}));

		const expected = SequenceCollection.from(players)
			.topBy((player) => player.score, 10)
			.toArray();

		const actual = await AsyncSequenceCollection.from(streamOf(players))
			.topBy((player) => player.score, 10)
			.toArray();

		expect(actual).toEqual(expected);
	});

	it('should hold only the window, not the stream', async () => {
		// The claim that makes this usable on a feed. Keys arrive strictly
		// ascending, so every element beats the incumbent — the case where an
		// implementation storing each winner in a new slot grows once per
		// element and is bounded by nothing at all.
		const size = 50_000;

		const best = await AsyncSequenceCollection.from(
			streamOf([...Array(size).keys()]),
		)
			.topBy((value) => value, 5)
			.toArray();

		expect(best).toEqual([size - 1, size - 2, size - 3, size - 4, size - 5]);
	});

	it('should await a key that has to be fetched', async () => {
		const best = AsyncSequenceCollection.from(
			streamOf(['a', 'bbb', 'bb']),
		).topBy(async (value) => {
			await Promise.resolve();
			return value.length;
		}, 2);

		expect(await best.toArray()).toEqual(['bbb', 'bb']);
	});

	it('should break ties on arrival, not on completion order', async () => {
		// `topByAwait` extracts keys concurrently and unordered, so the work
		// finishes in an order with nothing to do with the input. Every score is
		// identical here, which leaves the answer entirely to the tie-break — and
		// it must still be the first three that arrived.
		const players = Array.from({ length: 24 }, (_, index) => ({
			index,
			score: 1,
		}));

		const best = await AsyncSequenceCollection.from(streamOf(players))
			.topByAwait(
				async (player) => {
					// Deliberately uneven: the later ones finish first.
					await new Promise((resolve) =>
						setTimeout(resolve, 24 - player.index),
					);
					return player.score;
				},
				3,
				{ concurrency: 8, ordered: false },
			)
			.toArray();

		expect(best.map((player) => player.index)).toEqual([0, 1, 2]);
	});

	it('should extract keys concurrently in topByAwait', async () => {
		let running = 0;
		let peak = 0;

		await AsyncSequenceCollection.from(streamOf([...Array(12).keys()]))
			.topByAwait(
				async (value) => {
					running++;
					peak = Math.max(peak, running);
					await new Promise((resolve) => setTimeout(resolve, 5));
					running--;

					return value;
				},
				3,
				{ concurrency: 4 },
			)
			.toArray();

		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(4);
	});

	it.each([0, -1])('should yield nothing for a count of %s', async (count) => {
		const { source, pulled } = counted([1, 2, 3]);

		const best = AsyncSequenceCollection.from(source).topBy(
			(value) => value,
			count,
		);

		expect(await best.toArray()).toEqual([]);
		expect(pulled()).toBe(0);
	});
});

describe('tap', () => {
	it('should yield every element unchanged', async () => {
		const seen: number[] = [];

		const values = AsyncSequenceCollection.from(streamOf([1, 2, 3])).tap(
			(value) => {
				seen.push(value);
			},
		);

		expect(await values.toArray()).toEqual([1, 2, 3]);
		expect(seen).toEqual([1, 2, 3]);
	});

	it('should hold the stream while the action waits', async () => {
		// The reason it is awaited: an action that writes somewhere must not fall
		// behind the elements it is meant to be observing.
		const order: string[] = [];

		const source: AsyncIterable<number> = {
			async *[Symbol.asyncIterator](): AsyncIterator<number> {
				for (const value of [1, 2]) {
					order.push(`pulled ${value}`);
					yield value;
				}
			},
		};

		await AsyncSequenceCollection.from(source)
			.tap(async (value) => {
				await new Promise((resolve) => setTimeout(resolve, 5));
				order.push(`observed ${value}`);
			})
			.toArray();

		expect(order).toEqual(['pulled 1', 'observed 1', 'pulled 2', 'observed 2']);
	});

	it('should observe only what a bounded chain pulls', async () => {
		let observed = 0;
		const { source } = counted([1, 2, 3, 4, 5]);

		await AsyncSequenceCollection.from(source)
			.tap(() => {
				observed++;
			})
			.take(2)
			.toArray();

		expect(observed).toBe(2);
	});

	it('should hand the action the positional index', async () => {
		const positions: number[] = [];

		await AsyncSequenceCollection.from(streamOf(['a', 'b', 'c']))
			.tap((_value, index) => {
				positions.push(index);
			})
			.toArray();

		expect(positions).toEqual([0, 1, 2]);
	});
});
