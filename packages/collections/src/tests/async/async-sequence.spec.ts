import { describe, expect, it } from 'vitest';

import { AsyncSequenceCollection } from '@/collections/async';

/**
 * A source that produces over time and reports how far it has been pulled.
 *
 * Laziness and back pressure are the whole point of this type and neither shows
 * up in the values that come out, so most of these tests read this counter
 * rather than only the result.
 *
 * @param values Elements to yield.
 * @returns The asynchronous iterable and a reader of how far it has been pulled.
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

/** A source that never ends, for proving an operator stops pulling. */
const endless = (): { source: AsyncIterable<number>; pulled: () => number } => {
	let pulled = 0;

	return {
		source: {
			async *[Symbol.asyncIterator](): AsyncIterator<number> {
				for (let value = 0; ; value++) {
					pulled++;
					await Promise.resolve();
					yield value;
				}
			},
		},
		pulled: () => pulled,
	};
};

describe('creating an asynchronous sequence', () => {
	it('should wrap an asynchronous iterable', async () => {
		const { source } = counted([1, 2, 3]);

		expect(await AsyncSequenceCollection.from(source).toArray()).toEqual([
			1, 2, 3,
		]);
	});

	it('should accept a plain iterable', async () => {
		expect(await AsyncSequenceCollection.from([1, 2, 3]).toArray()).toEqual([
			1, 2, 3,
		]);
	});

	it('should await the elements of an iterable of promises', async () => {
		// The `ids.map(load)` shape, which is how most of this starts.
		const pending = [Promise.resolve('a'), Promise.resolve('b')];

		expect(await AsyncSequenceCollection.from(pending).toArray()).toEqual([
			'a',
			'b',
		]);
	});

	it('should adapt a synchronous source without draining it', async () => {
		// An endless synchronous generator must stay usable.
		const naturals = function* (): Generator<number> {
			for (let value = 0; ; value++) yield value;
		};

		expect(
			await AsyncSequenceCollection.from(naturals()).take(3).toArray(),
		).toEqual([0, 1, 2]);
	});

	it('should produce an empty sequence', async () => {
		expect(await AsyncSequenceCollection.empty<number>().toArray()).toEqual([]);
	});

	it('should be consumable with for await', async () => {
		const collected: number[] = [];

		for await (const value of AsyncSequenceCollection.from([1, 2])) {
			collected.push(value);
		}

		expect(collected).toEqual([1, 2]);
	});
});

describe('laziness and back pressure', () => {
	it('should read nothing until the result is consumed', async () => {
		const { source, pulled } = counted([1, 2, 3]);

		const query = AsyncSequenceCollection.from(source)
			.where((value) => value > 1)
			.select((value) => value * 10);

		expect(pulled()).toBe(0);

		await query.toArray();

		expect(pulled()).toBe(3);
	});

	it('should stop pulling an endless source once take is satisfied', async () => {
		const { source, pulled } = endless();

		expect(
			await AsyncSequenceCollection.from(source).take(3).toArray(),
		).toEqual([0, 1, 2]);
		expect(pulled()).toBe(3);
	});

	it('should answer any on an endless source', async () => {
		const { source, pulled } = endless();

		expect(await AsyncSequenceCollection.from(source).any()).toBe(true);
		expect(pulled()).toBe(1);
	});

	it('should not run ahead of the consumer', async () => {
		// One element is pulled, processed, and only then is the next asked
		// for — which is what keeps a large source from being buffered.
		const { source, pulled } = counted([1, 2, 3, 4, 5]);
		const seen: number[] = [];

		for await (const value of AsyncSequenceCollection.from(source)) {
			seen.push(value);

			expect(pulled()).toBe(seen.length);

			if (seen.length === 2) break;
		}

		expect(pulled()).toBe(2);
	});

	it('should stop at the first failure of takeWhile', async () => {
		const { source, pulled } = counted([1, 2, 9, 1]);

		expect(
			await AsyncSequenceCollection.from(source)
				.takeWhile((value) => value < 3)
				.toArray(),
		).toEqual([1, 2]);
		expect(pulled()).toBe(3);
	});
});

describe('operators', () => {
	it('should accept synchronous and asynchronous functions alike', async () => {
		const sync = await AsyncSequenceCollection.from([1, 2, 3])
			.where((value) => value > 1)
			.select((value) => value * 2)
			.toArray();

		const async = await AsyncSequenceCollection.from([1, 2, 3])
			.where(async (value) => value > 1)
			.select(async (value) => value * 2)
			.toArray();

		expect(sync).toEqual([4, 6]);
		expect(async).toEqual(sync);
	});

	it('should flatten both synchronous and asynchronous inner sequences', async () => {
		const flattened = await AsyncSequenceCollection.from([1, 2])
			.selectMany((value) => [value, value * 10])
			.toArray();

		const nested = await AsyncSequenceCollection.from([1, 2])
			.selectMany((value) => AsyncSequenceCollection.from([value, value * 10]))
			.toArray();

		expect(flattened).toEqual([1, 10, 2, 20]);
		expect(nested).toEqual(flattened);
	});

	it('should skip, skipWhile and distinct', async () => {
		expect(
			await AsyncSequenceCollection.from([1, 2, 3, 4]).skip(2).toArray(),
		).toEqual([3, 4]);

		expect(
			await AsyncSequenceCollection.from([1, 2, 9, 1])
				.skipWhile((value) => value < 3)
				.toArray(),
		).toEqual([9, 1]);

		expect(
			await AsyncSequenceCollection.from([1, 1, 2, 1]).distinct().toArray(),
		).toEqual([1, 2]);
	});

	it('should keep one element per distinct key', async () => {
		expect(
			await AsyncSequenceCollection.from([
				{ id: 1, name: 'a' },
				{ id: 1, name: 'b' },
				{ id: 2, name: 'c' },
			])
				.distinctBy((user) => user.id)
				.select((user) => user.name)
				.toArray(),
		).toEqual(['a', 'c']);
	});

	it('should concatenate a synchronous or asynchronous sequence', async () => {
		expect(
			await AsyncSequenceCollection.from([1, 2]).concat([3]).toArray(),
		).toEqual([1, 2, 3]);

		expect(
			await AsyncSequenceCollection.from([1])
				.concat(AsyncSequenceCollection.from([2]))
				.toArray(),
		).toEqual([1, 2]);
	});

	it('should batch an arriving stream into chunks', async () => {
		expect(
			await AsyncSequenceCollection.from([1, 2, 3]).chunk(2).toArray(),
		).toEqual([[1, 2], [3]]);
	});

	it.each([0, -1, 1.5])('should reject a chunk size of %s', (size) => {
		expect(() => AsyncSequenceCollection.from([1]).chunk(size)).toThrow(
			/positive integer/i,
		);
	});

	it('should yield the running accumulation', async () => {
		expect(
			await AsyncSequenceCollection.from([1, 2, 3])
				.scan(0, (total, value) => total + value)
				.toArray(),
		).toEqual([1, 3, 6]);
	});
});

describe('terminals', () => {
	it('should answer the scalar questions', async () => {
		const of = (): ReturnType<typeof AsyncSequenceCollection.from<number>> =>
			AsyncSequenceCollection.from([1, 2, 3]);

		expect(await of().count()).toBe(3);
		expect(await of().any()).toBe(true);
		expect(await of().all((value) => value > 0)).toBe(true);
		expect(await of().all((value) => value > 1)).toBe(false);
		expect(await of().first()).toBe(1);
		expect(await of().last()).toBe(3);
		expect(await of().aggregate(0, (total, value) => total + value)).toBe(6);
	});

	it('should report absence rather than throwing, where asked to', async () => {
		const empty = (): ReturnType<
			typeof AsyncSequenceCollection.empty<number>
		> => AsyncSequenceCollection.empty<number>();

		expect(await empty().firstOrNull()).toBeNull();
		expect(await empty().lastOrNull()).toBeNull();
		expect(await empty().elementAtOrNull(0)).toBeNull();
		await expect(empty().first()).rejects.toThrow(/empty/i);
		await expect(empty().last()).rejects.toThrow(/empty/i);
	});

	it('should not mistake a null last element for an empty sequence', async () => {
		expect(
			await AsyncSequenceCollection.from([1, null]).lastOrNull(),
		).toBeNull();
		expect(await AsyncSequenceCollection.from([1, null]).last()).toBeNull();
	});

	it('should read an element positionally', async () => {
		expect(
			await AsyncSequenceCollection.from(['a', 'b']).elementAtOrNull(1),
		).toBe('b');
		expect(
			await AsyncSequenceCollection.from(['a']).elementAtOrNull(5),
		).toBeNull();
	});

	it('should hand forEach the index alongside the element', async () => {
		const seen: [number, number][] = [];

		await AsyncSequenceCollection.from([10, 20]).forEach((value, index) => {
			seen.push([index, value]);
		});

		expect(seen).toEqual([
			[0, 10],
			[1, 20],
		]);
	});

	it('should materialize into a set', async () => {
		expect([
			...(await AsyncSequenceCollection.from([1, 1, 2]).toSet()),
		]).toEqual([1, 2]);
	});
});

describe('cancellation', () => {
	it('should reject with the reason the signal carries', async () => {
		const controller = new AbortController();
		const reason = new Error('called off');

		controller.abort(reason);

		await expect(
			AsyncSequenceCollection.from([1, 2, 3]).toArray({
				signal: controller.signal,
			}),
		).rejects.toBe(reason);
	});

	it('should stop pulling as soon as it is aborted', async () => {
		const { source, pulled } = counted([1, 2, 3, 4, 5]);
		const controller = new AbortController();

		await expect(
			AsyncSequenceCollection.from(source).forEach((_, index) => {
				if (index === 1) controller.abort();
			}, {}),
		).resolves.toBeUndefined();

		// A run with no signal reads everything, which is the baseline the next
		// assertion is measured against.
		expect(pulled()).toBe(5);

		const second = counted([1, 2, 3, 4, 5]);
		const stopper = new AbortController();

		await expect(
			AsyncSequenceCollection.from(second.source).forEach(
				(_, index) => {
					if (index === 1) stopper.abort();
				},
				{ signal: stopper.signal },
			),
		).rejects.toThrow();

		// Three: two delivered, and the one whose check found the abort.
		expect(second.pulled()).toBe(3);
	});

	it('should leave a consumption without a signal alone', async () => {
		expect(await AsyncSequenceCollection.from([1, 2]).toArray({})).toEqual([
			1, 2,
		]);
	});

	it('should let the same sequence be consumed twice under different signals', async () => {
		// The reason the signal sits on the terminal rather than on `from`.
		const sequence = AsyncSequenceCollection.from([1, 2, 3]);
		const controller = new AbortController();

		expect(await sequence.toArray()).toEqual([1, 2, 3]);

		controller.abort();

		await expect(
			sequence.toArray({ signal: controller.signal }),
		).rejects.toThrow();
	});
});
