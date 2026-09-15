import { beforeEach, describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Performance suite.
 *
 * Execution cost is asserted through counters of actual work — elements pulled
 * out of the source, projections invoked, comparisons performed — rather than
 * through elapsed time, which depends on the machine and turns into a flaky
 * test. Each counter encodes an algorithmic guarantee: a lazy operator that
 * starts traversing eagerly, or a sort that stops caching its keys, breaks the
 * corresponding expectation by orders of magnitude, not by a few percent.
 *
 * The handful of wall clock assertions at the end are deliberately generous.
 * They are smoke ceilings against a catastrophic regression, not measurements.
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
 * The iterable is deliberately not an array: array fast paths would hide the
 * traversals the counters are there to observe.
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

describe('SequenceCollection Performance', () => {
	describe('counting', () => {
		it('should answer a known count without pulling a single element', () => {
			const numbers = SequenceCollection.from([...Array(VOLUME).keys()]);

			expect(numbers.count()).toBe(VOLUME);
			expect(numbers.select((n) => n).count()).toBe(VOLUME);
			expect(numbers.take(10).count()).toBe(10);
			expect(numbers.skip(10).count()).toBe(VOLUME - 10);
			expect(numbers.orderBy((n) => n).count()).toBe(VOLUME);
			expect(visits).toBe(0);
			expect(projections).toBe(0);
		});

		it('should not sort a sequence that is only being counted', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(
				numbers
					.orderBy(counted((n) => n))
					.thenByDescending(counted((n) => n % 7))
					.count(),
			).toBe(VOLUME);

			// The source does not declare its size, so the elements do have to
			// be walked — but counting never depends on the order, so not a
			// single key may be extracted and nothing may be materialized.
			expect(visits).toBe(VOLUME);
			expect(projections).toBe(0);
		});

		it('should skip the sort on the aggregates that ignore order', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));
			const ordered = numbers.orderBy(counted((n) => n));

			expect(ordered.any()).toBe(true);
			expect(ordered.min()).toBe(0);
			expect(ordered.max()).toBe(VOLUME - 1);
			expect(ordered.sum()).toBe((VOLUME * (VOLUME - 1)) / 2);

			expect(projections).toBe(0);
		});

		it('should traverse exactly once when the count depends on the data', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(numbers.where((n) => n % 2 === 0).count()).toBe(VOLUME / 2);
			expect(visits).toBe(VOLUME);
		});

		it('should answer any() in constant time on a known cardinality', () => {
			const numbers = SequenceCollection.from([...Array(VOLUME).keys()]);

			expect(numbers.any()).toBe(true);
			expect(numbers.take(0).any()).toBe(false);
			expect(numbers.skip(VOLUME).any()).toBe(false);
			expect(visits).toBe(0);
		});
	});

	describe('laziness', () => {
		it('should pull only what take() asks for, whatever the volume', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(numbers.take(5).toArray()).toEqual([0, 1, 2, 3, 4]);
			expect(visits).toBe(5);
		});

		it('should stop at the first match of first() and any()', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(numbers.first()).toBe(0);
			expect(visits).toBe(1);

			visits = 0;
			expect(numbers.any((n) => n >= 10)).toBe(true);
			expect(visits).toBe(11);
		});

		it('should keep a filtered chain lazy up to the element that is consumed', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			const result = numbers
				.where(counted((n) => n % 2 === 0))
				.select(counted((n) => n * 2))
				.take(3)
				.toArray();

			expect(result).toEqual([0, 4, 8]);
			// Five source elements are enough to produce three even ones, and
			// no projection runs on the elements the filter rejected.
			expect(visits).toBe(5);
			expect(projections).toBe(5 + 3);
		});

		it('should not traverse anything while a chain is only being described', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers
				.where(counted((n) => n % 2 === 0))
				.select(counted((n) => n * 2))
				.distinct()
				.skip(10)
				.take(10);

			expect(visits).toBe(0);
			expect(projections).toBe(0);
		});
	});

	describe('single traversal', () => {
		it('should read the source exactly once per materialization', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers
				.where((n) => n % 3 === 0)
				.select((n) => n + 1)
				.toArray();

			expect(visits).toBe(VOLUME);
		});

		it('should invoke each projection exactly once per element', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers.select(counted((n) => n * 2)).toArray();

			expect(projections).toBe(VOLUME);
		});

		it('should scale linearly rather than quadratically', () => {
			const small = SequenceCollection.from(instrumentedSource(1_000));
			small.select((n) => n).toArray();
			const smallVisits = visits;

			visits = 0;
			const large = SequenceCollection.from(instrumentedSource(2_000));
			large.select((n) => n).toArray();

			// Doubling the input may only double the work. A quadratic
			// implementation would land at four times as much.
			expect(visits).toBe(smallVisits * 2);
		});
	});

	describe('sorting', () => {
		it('should extract each sorting key exactly once per element', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers.orderBy(counted((n) => -n)).toArray();

			// One call per element. Comparing the elements themselves would
			// call the projection twice per comparison instead, which for this
			// volume is above a million calls.
			expect(projections).toBe(VOLUME);
			expect(visits).toBe(VOLUME);
		});

		it('should extract each key once per criterion on a composite sort', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers
				.orderBy(counted((n) => n % 100))
				.thenBy(counted((n) => n % 7))
				.thenByDescending(counted((n) => n))
				.toArray();

			expect(projections).toBe(VOLUME * 3);
			expect(visits).toBe(VOLUME);
		});

		it('should sort a composite criteria set in a single pass', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			numbers
				.orderBy((n) => n % 10)
				.thenBy((n) => n)
				.toArray();

			// A secondary criterion rebuilds one sort over the unsorted origin
			// instead of sorting an already sorted sequence again.
			expect(visits).toBe(VOLUME);
		});

		it('should copy an array source without going through its iterator', () => {
			let pulls = 0;

			// `Array.isArray` still holds for a subclass, so the fast path has
			// to be taken while the overridden iterator stays observable.
			class CountingArray extends Array<number> {
				override [Symbol.iterator](): ArrayIterator<number> {
					pulls++;
					return super[Symbol.iterator]();
				}
			}

			const source = CountingArray.from(Array(VOLUME).keys()) as CountingArray;
			const numbers = SequenceCollection.from(source);

			expect(numbers.toArray().length).toBe(VOLUME);
			expect(numbers.orderBy((n) => -n).toArray()[0]).toBe(VOLUME - 1);

			// Copying memory directly, never one element at a time — the
			// difference is close to twenty fold on this volume.
			expect(pulls).toBe(0);
		});
	});

	describe('element access', () => {
		it('should reach the last element of an array without scanning it', () => {
			const source = [...Array(VOLUME).keys()];
			const numbers = SequenceCollection.from(source);

			expect(numbers.last()).toBe(VOLUME - 1);
			expect(numbers.last(counted((n) => n > VOLUME - 4))).toBe(VOLUME - 1);

			// The unfiltered read touches nothing, and the filtered one stops
			// at the first match coming from the end.
			expect(projections).toBe(1);
		});

		it('should read a lazy source once when looking for its last element', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(numbers.last()).toBe(VOLUME - 1);
			expect(visits).toBe(VOLUME);
		});
	});

	describe('hashing operators', () => {
		it('should hash each element once in distinct(), union() and intersect()', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			expect(numbers.distinct().count()).toBe(VOLUME);
			expect(visits).toBe(VOLUME);

			visits = 0;
			expect(numbers.union([1, 2, 3]).count()).toBe(VOLUME);
			expect(visits).toBe(VOLUME);

			visits = 0;
			expect(numbers.intersect([1, 2, 3]).count()).toBe(3);
			expect(visits).toBe(VOLUME);
		});

		it('should invoke the grouping projection once per element', () => {
			const numbers = SequenceCollection.from(instrumentedSource(VOLUME));

			const groups = numbers.groupBy(counted((n) => n % 500)).toArray();

			expect(groups.length).toBe(500);
			expect(projections).toBe(VOLUME);
			expect(visits).toBe(VOLUME);
		});

		it('should index the inner sequence of a join once', () => {
			const outer = SequenceCollection.from(instrumentedSource(VOLUME));
			const inner = [...Array(VOLUME).keys()].map((id) => ({ id }));

			const joined = outer.join(
				inner,
				(n) => n,
				(item) => item.id,
				(n, item) => n + item.id,
			);

			expect(joined.count()).toBe(VOLUME);
			// The outer sequence is traversed once, and the inner one is
			// hashed once rather than rescanned per outer element.
			expect(visits).toBe(VOLUME);
		});
	});

	describe('wall clock ceilings', () => {
		it('should count a million elements instantly', () => {
			const numbers = SequenceCollection.from([...Array(LARGE_VOLUME).keys()]);

			const startedAt = performance.now();
			const total = numbers
				.select((n) => n)
				.take(500)
				.count();
			const elapsed = performance.now() - startedAt;

			expect(total).toBe(500);
			expect(elapsed).toBeLessThan(50);
		});

		it('should filter and materialize a million elements within budget', () => {
			const numbers = SequenceCollection.from([...Array(LARGE_VOLUME).keys()]);

			const startedAt = performance.now();
			const result = numbers
				.where((n) => n % 2 === 0)
				.select((n) => n * 2)
				.toArray();
			const elapsed = performance.now() - startedAt;

			expect(result.length).toBe(LARGE_VOLUME / 2);
			expect(elapsed).toBeLessThan(3_000);
		});

		it('should sort a million elements within budget', () => {
			const source = [...Array(LARGE_VOLUME).keys()].map((n) => ({
				id: n,
				key: (n * 7919) % LARGE_VOLUME,
			}));
			const numbers = SequenceCollection.from(source);

			const startedAt = performance.now();
			const sorted = numbers.orderBy((item) => item.key).toArray();
			const elapsed = performance.now() - startedAt;

			expect(sorted[0].key).toBe(0);
			expect(sorted.length).toBe(LARGE_VOLUME);
			expect(elapsed).toBeLessThan(5_000);
		});
	});
});
