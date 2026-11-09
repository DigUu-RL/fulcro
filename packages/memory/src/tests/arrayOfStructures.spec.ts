import { describe, expect, it } from 'vitest';

import {
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/src/allocate';
import type { Allocation, Allocator } from '@/src/allocator';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import type { Storage } from '@/src/storage';

/**
 * Behaviour suite for `ArrayOfStructures`.
 *
 * It is the layout every storage held as bytes already had, so what is
 * asserted is that naming it changes nothing: the same request to the
 * allocator, the same bytes, the same values as leaving it out.
 */

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});

type Starfighter = Struct<typeof Starfighter>;

/** Sixteen bytes, seven of them tail padding, which every value carries. */
const ScannerReading = struct('ScannerReading', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

/**
 * An allocator over one buffer the suite can read, recording what it was
 * asked for.
 *
 * @returns The allocator, its bytes and its requests.
 */
const createHangarAllocator = (): {
	allocator: Allocator;
	bytes: Uint8Array;
	requests: [number, number][];
} => {
	const buffer = new ArrayBuffer(1024);
	const requests: [number, number][] = [];

	return {
		allocator: {
			allocate: (size: number, alignment: number): Allocation => {
				requests.push([size, alignment]);

				return { bytes: new DataView(buffer, 0, size), isLive: () => true };
			},
		},
		bytes: new Uint8Array(buffer),
		requests,
	};
};

describe('ArrayOfStructures', () => {
	it('should be the layout a storage has when none is named', () => {
		const named = createHangarAllocator();
		const omitted = createHangarAllocator();
		const redFive: Starfighter = Starfighter.from({ shields: 1, hull: 2, speed: 3 });

		allocate(Starfighter, 4, named.allocator, ArrayOfStructures).set(2, redFive);
		allocate(Starfighter, 4, omitted.allocator).set(2, redFive);

		expect(named.requests).toEqual(omitted.requests);
		expect([...named.bytes]).toEqual([...omitted.bytes]);
	});

	it('should hold each value end to end, its fields together', () => {
		const hangar = createHangarAllocator();

		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			4,
			hangar.allocator,
			ArrayOfStructures,
		);

		fleet.set(2, Starfighter.from({ shields: 1, hull: 2, speed: 3 }));

		expect([...new Float32Array(hangar.bytes.buffer, 0, 12)]).toEqual([
			0, 0, 0, 0, 0, 0, 1, 2, 3, 0, 0, 0,
		]);
	});

	it('should ask for every value with its padding, so the next starts aligned', () => {
		const hangar = createHangarAllocator();

		allocate(ScannerReading, 10, hangar.allocator, ArrayOfStructures);

		expect(hangar.requests).toEqual([[160, 8]]);
	});

	it('should be frozen, and carry nothing a consumer can call', () => {
		expect(Object.isFrozen(ArrayOfStructures)).toBe(true);
		expect({ ...ArrayOfStructures }).toEqual({ name: 'ArrayOfStructures' });
	});
});
