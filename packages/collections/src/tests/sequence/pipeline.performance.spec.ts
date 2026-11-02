import { beforeEach, describe, expect, it } from 'vitest';

import type { Sequence } from '@/src/@types/collections/sequence';
import { SequenceCollection } from '@/src/collections/sequence';

/**
 * Performance suite for the fusion of adjacent `where` and `select` stages.
 *
 * What fusion removes is the generators between the consumer and the source:
 * without it, every stage of a chain is one more generator resumed for every
 * element. That cost is counted here as the depth of the call stack at the
 * moment the source hands an element over — one frame per generator in the
 * way — measured for a short chain and a long one, fused and unfused, in the
 * same run. The depth is a count, not a duration: it is the same on any
 * machine, and it grows with the chain exactly when a stage stopped fusing.
 *
 * The work that must not change is counted beside it: elements pulled from
 * the source, and calls made to the predicates and the projections.
 */

/** Volume used by the assertions counting work. */
const VOLUME = 100_000;

/** Elements pulled out of the instrumented source since the last reset. */
let visits = 0;

/** Calls made to the instrumented predicates and projections since the last reset. */
let calls = 0;

beforeEach(() => {
	visits = 0;
	calls = 0;
});

/**
 * Reads how deep the call stack is at the point of the call.
 *
 * Lifts the stack trace limit for the one read, so that a deep chain is not
 * cut off at the engine's default of ten frames.
 *
 * @returns The amount of frames on the stack.
 */
const stackDepth = (): number => {
	const limit: number = Error.stackTraceLimit;

	Error.stackTraceLimit = Number.POSITIVE_INFINITY;

	const depth: number = (new Error().stack ?? '').split('\n').length;

	Error.stackTraceLimit = limit;

	return depth;
};

/**
 * Builds a source that counts the elements it hands over.
 *
 * Deliberately not an array, so no fast path hides the traversal.
 *
 * @param size Amount of elements the source yields.
 * @param depths When given, receives the stack depth at each element handed over.
 * @returns The instrumented source.
 */
const instrumentedSource = (size: number, depths?: number[]): Iterable<number> => {
	return {
		*[Symbol.iterator](): Iterator<number> {
			for (let index = 0; index < size; index++) {
				visits++;
				depths?.push(stackDepth());
				yield index;
			}
		},
	};
};

/**
 * Hands a sequence to the next stage through a plain iterable, so the next
 * stage cannot fuse with this one. Forwards the iterator, adding no generator.
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

/**
 * Builds a chain alternating filters and projections, each of them counted.
 *
 * @param source Elements the chain starts from.
 * @param length Amount of stages.
 * @param fuse Whether adjacent stages may fuse.
 * @returns The sequence the chain describes.
 */
const chain = (source: Iterable<number>, length: number, fuse: boolean): Sequence<number> => {
	let sequence: Sequence<number> = SequenceCollection.from(source);

	for (let stage = 0; stage < length; stage++) {
		const input: Sequence<number> = fuse ? sequence : unfused(sequence);

		sequence =
			stage % 2 === 0
				? input.where((value) => {
						calls++;

						return value % 7 !== 0;
					})
				: input.select((value) => {
						calls++;

						return value + 1;
					});
	}

	return sequence;
};

/**
 * Measures the stack depth at which the source hands its elements over.
 *
 * @param length Amount of stages of the chain.
 * @param fuse Whether adjacent stages may fuse.
 * @returns The depth, which is the same for every element.
 */
const depthThrough = (length: number, fuse: boolean): number => {
	const depths: number[] = [];

	chain(instrumentedSource(16, depths), length, fuse).toArray();

	expect(new Set(depths).size).toBe(1);

	return depths[0] ?? Number.NaN;
};

describe('pipeline fusion cost', () => {
	it('should keep the generators between consumer and source at one, however long the chain', () => {
		expect(depthThrough(8, true)).toBe(depthThrough(1, true));
	});

	it('should show the baseline growing by at least one frame per stage', () => {
		// The baseline is what proves the measure above can see a generator at
		// all: without fusion, seven more stages are seven more frames.
		expect(depthThrough(8, false) - depthThrough(1, false)).toBeGreaterThanOrEqual(7);
	});

	it('should put the fused chain no deeper than the shortest unfused one', () => {
		expect(depthThrough(8, true)).toBe(depthThrough(1, false));
	});

	it('should start a new run after any operator that is not a filter or a projection', () => {
		/**
		 * Measures the depth at which the source hands its elements over.
		 *
		 * @param build The chain to measure, over the instrumented source.
		 * @returns The depth, which is the same for every element.
		 */
		const depthOf = (build: (sequence: Sequence<number>) => Sequence<number>): number => {
			const depths: number[] = [];

			build(SequenceCollection.from(instrumentedSource(16, depths))).toArray();

			return depths[0] ?? Number.NaN;
		};

		// Both chains hold the same operators; only the order differs. With the
		// operator last, the two filters are one run; with it between them, the
		// second filter has to start a run of its own, one generator deeper.
		for (const operator of [
			(sequence: Sequence<number>): Sequence<number> => sequence.take(16),
			(sequence: Sequence<number>): Sequence<number> => sequence.distinct(),
		]) {
			const fused: number = depthOf((sequence) => {
				return operator(sequence.where(() => true).where(() => true));
			});

			const split: number = depthOf((sequence) => {
				return operator(sequence.where(() => true)).where(() => true);
			});

			expect(split).toBeGreaterThan(fused);
		}
	});

	it('should pull every element once and call every step as often as the unfused chain', () => {
		const fused: number[] = chain(instrumentedSource(VOLUME), 8, true).toArray();
		const fusedVisits: number = visits;
		const fusedCalls: number = calls;

		visits = 0;
		calls = 0;

		const baseline: number[] = chain(instrumentedSource(VOLUME), 8, false).toArray();

		expect(fused).toEqual(baseline);
		expect(fusedVisits).toBe(VOLUME);
		expect(visits).toBe(VOLUME);
		expect(fusedCalls).toBe(calls);
	});

	it('should pull only what an early stop needs', () => {
		chain(instrumentedSource(VOLUME), 8, true).take(3).toArray();

		// The first filter drops 0 and keeps 1, 2 and 3: four pulls, then stop.
		expect(visits).toBe(4);
	});
});
