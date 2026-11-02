import { describe, expect, it } from 'vitest';

import type { Sequence } from '@/src/@types/collections/sequence';
import { SequenceCollection } from '@/src/collections/sequence';

/**
 * Behaviour suite for the fusion of adjacent `where` and `select` stages.
 *
 * Every case compares a fused chain against the same chain with fusion broken
 * between each stage: the promise is that fusing changes nothing a consumer can
 * observe, so the unfused chain is the specification.
 */

/**
 * Hands a sequence to the next stage through a plain iterable, which is not a
 * pipeline and therefore stops the next stage from fusing with this one.
 *
 * Forwards the iterator rather than re-yielding, so the baseline adds no
 * generator of its own.
 *
 * @template T Type of the elements of the sequence.
 * @param sequence Sequence to hand over.
 * @returns A sequence the next stage cannot fuse with.
 */
const unfused = <T>(sequence: Sequence<T>): Sequence<T> => {
	return SequenceCollection.from({
		[Symbol.iterator]: (): Iterator<T> => sequence[Symbol.iterator](),
	});
};

/** One stage of a chain, applied either fused or not. */
type Stage = (sequence: Sequence<number>) => Sequence<number>;

/**
 * Applies a chain of stages, with or without fusion between them.
 *
 * @param source Elements the chain starts from.
 * @param stages Stages to apply, in order.
 * @param fuse Whether adjacent stages may fuse.
 * @returns The sequence the chain describes.
 */
const chain = (
	source: Iterable<number>,
	stages: readonly Stage[],
	fuse: boolean,
): Sequence<number> => {
	let sequence: Sequence<number> = SequenceCollection.from(source);

	for (const stage of stages) sequence = stage(fuse ? sequence : unfused(sequence));

	return sequence;
};

/**
 * Builds a source that records how it was traversed.
 *
 * @param size Amount of elements the source yields.
 * @returns The source, and how many times it was opened and closed.
 */
const trackedSource = (
	size: number,
): { source: Iterable<number>; opened: () => number; closed: () => number } => {
	let opened = 0;
	let closed = 0;

	return {
		source: {
			[Symbol.iterator](): Iterator<number> {
				opened++;

				let index = 0;

				return {
					next(): IteratorResult<number> {
						if (index < size) return { done: false, value: index++ };

						return { done: true, value: undefined };
					},
					return(): IteratorResult<number> {
						closed++;

						return { done: true, value: undefined };
					},
				};
			},
		},
		opened: () => opened,
		closed: () => closed,
	};
};

describe('pipeline fusion', () => {
	it('should produce the same elements as the unfused chain', () => {
		const stages: Stage[] = [
			(sequence): Sequence<number> => sequence.where((value) => value % 2 === 0),
			(sequence): Sequence<number> => sequence.select((value) => value * 3),
			(sequence): Sequence<number> => sequence.where((value) => value % 4 !== 0),
			(sequence): Sequence<number> => sequence.select((value) => value - 1),
			(sequence): Sequence<number> => sequence.select((value) => value * value),
		];

		const source: number[] = Array.from({ length: 200 }, (_, index) => index);

		expect(chain(source, stages, true).toArray()).toEqual(chain(source, stages, false).toArray());
	});

	it('should invoke predicates and projections in the same interleaved order', () => {
		/**
		 * Runs a chain whose stages log every call they receive.
		 *
		 * @param fuse Whether adjacent stages may fuse.
		 * @returns The calls, in the order they were made.
		 */
		const record = (fuse: boolean): string[] => {
			const log: string[] = [];

			const stages: Stage[] = [
				(sequence): Sequence<number> => {
					return sequence.select((value) => {
						log.push(`double ${String(value)}`);

						return value * 2;
					});
				},
				(sequence): Sequence<number> => {
					return sequence.where((value) => {
						log.push(`keep ${String(value)}`);

						return value % 3 !== 0;
					});
				},
				(sequence): Sequence<number> => {
					return sequence.select((value) => {
						log.push(`shift ${String(value)}`);

						return value + 1;
					});
				},
			];

			chain([1, 2, 3, 4, 5, 6], stages, fuse).toArray();

			return log;
		};

		expect(record(true)).toEqual(record(false));

		expect(record(true).slice(0, 6)).toEqual([
			'double 1',
			'keep 2',
			'shift 2',
			'double 2',
			'keep 4',
			'shift 4',
		]);
	});

	it('should leave an intermediate sequence usable on its own', () => {
		const evens: Sequence<number> = SequenceCollection.from([1, 2, 3, 4, 5, 6]).where(
			(value) => value % 2 === 0,
		);

		const tripled: Sequence<number> = evens.select((value) => value * 3);
		const large: Sequence<number> = evens.where((value) => value > 2);

		expect(tripled.toArray()).toEqual([6, 12, 18]);
		expect(large.toArray()).toEqual([4, 6]);
		expect(evens.toArray()).toEqual([2, 4, 6]);
	});

	it('should start over on every traversal', () => {
		const { source, opened } = trackedSource(5);

		const sequence: Sequence<number> = SequenceCollection.from(source)
			.where((value) => value > 1)
			.select((value) => value * 10);

		expect(sequence.toArray()).toEqual([20, 30, 40]);
		expect(sequence.toArray()).toEqual([20, 30, 40]);
		expect(opened()).toBe(2);
	});

	it('should close the source when the consumer stops early', () => {
		const { source, closed } = trackedSource(1_000);

		const taken: number[] = SequenceCollection.from(source)
			.where((value) => value % 2 === 1)
			.select((value) => value * 2)
			.take(2)
			.toArray();

		expect(taken).toEqual([2, 6]);
		expect(closed()).toBe(1);
	});

	it('should close the source and surface the same error when a step throws', () => {
		const failure: Error = new RangeError('step failed');
		const { source, closed } = trackedSource(10);

		const sequence: Sequence<number> = SequenceCollection.from(source)
			.select((value) => value + 1)
			.where((value) => {
				if (value === 4) throw failure;

				return true;
			});

		expect(() => sequence.toArray()).toThrow(failure);
		expect(closed()).toBe(1);
	});

	it('should carry a known count through projections and drop it at a filter', () => {
		let projections = 0;

		/**
		 * Counts a call to a projection.
		 *
		 * @param value Value being projected.
		 * @returns The value, unchanged.
		 */
		const counted = (value: number): number => {
			projections++;

			return value;
		};

		const projected: Sequence<number> = SequenceCollection.from([1, 2, 3, 4])
			.select((value) => counted(value) * 2)
			.select((value) => counted(value) + 1);

		expect(projected.count()).toBe(4);
		expect(projections).toBe(0);

		expect(projected.where((value) => value > 5).count()).toBe(2);
	});

	it('should stop fusing at a stage that is not a filter or a projection', () => {
		const result: number[] = SequenceCollection.from([5, 3, 8, 1, 9, 2])
			.where((value) => value > 1)
			.orderBy((value) => value)
			.select((value) => value * 10)
			.where((value) => value < 90)
			.toArray();

		expect(result).toEqual([20, 30, 50, 80]);
	});

	it('should pass through elements that are themselves empty values', () => {
		const values: unknown[] = [undefined, null, 0, '', false, Number.NaN];

		const result: unknown[] = SequenceCollection.from(values)
			.where(() => true)
			.select((value) => value)
			.toArray();

		expect(result).toEqual(values);
	});
});
