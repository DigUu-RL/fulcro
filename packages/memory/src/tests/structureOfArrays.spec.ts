import { describe, expect, it } from 'vitest';

import {
	Decimal,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/src/allocate';
import type { Allocation, Allocator } from '@/src/allocator';
import { ArrayOfStructures } from '@/src/arrayOfStructures';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import { createManagedAllocator } from '@/src/managedAllocator';
import type { Storage } from '@/src/storage';
import { StructureOfArrays } from '@/src/structureOfArrays';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for `StructureOfArrays`.
 *
 * The `Storage<T>` contract runs over it in `storage.spec.ts`. What is here is
 * the part the layout adds: every value written and read back comes out as it
 * does from an array of structures, for every type a field can have, while the
 * bytes underneath sit one field at a time.
 */

/** Twelve bytes, three fields of four: a column each. */
const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});

type Starfighter = Struct<typeof Starfighter>;

/** Sixteen bytes, seven of them tail padding, which no column carries. */
const ScannerReading = struct('ScannerReading', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

const HyperdriveMotivator = struct('HyperdriveMotivator', {
	rating: HalfPrecisionFloat,
	serial: UnsignedInteger(16),
});

/** One field of every type a field can have, a nested struct among them. */
const Freighter = struct(
	'Freighter',
	{
		crew: SignedInteger(8),
		cargoBays: SignedInteger(16),
		parsecs: SignedInteger(32),
		credits: SignedInteger(64),
		bounty: SignedInteger(128),
		droids: UnsignedInteger(8),
		passengers: UnsignedInteger(16),
		fuel: UnsignedInteger(32),
		smuggled: UnsignedInteger(64),
		registry: UnsignedInteger(128),
		heat: HalfPrecisionFloat,
		shields: SinglePrecisionFloat,
		mass: DoublePrecisionFloat,
		price: Decimal,
		motivator: HyperdriveMotivator,
	},
	{
		isFastEnough(): boolean {
			return this.parsecs < 13;
		},
	},
);

type Freighter = Struct<typeof Freighter>;

/**
 * A freighter whose every field depends on its position, so that a value read
 * from the wrong index or the wrong column shows.
 *
 * @param index Position of the freighter.
 * @returns The freighter.
 */
const freighterAt = (index: number): Freighter => {
	return Freighter.from({
		crew: -index,
		cargoBays: 300 + index,
		parsecs: 12 + index,
		credits: -(2n ** 40n) - BigInt(index),
		bounty: 2n ** 100n + BigInt(index),
		droids: index % 256,
		passengers: 1_000 + index,
		fuel: 4_000_000_000 - index,
		smuggled: 2n ** 63n + BigInt(index),
		registry: 2n ** 127n + BigInt(index),
		heat: 0.5 + index,
		shields: 1.25 * index,
		mass: Number.MAX_SAFE_INTEGER - index,
		price: Decimal.from(`${String(index)}.75`),
		motivator: { rating: 2, serial: 0x1138 + index },
	});
};

/**
 * An allocator over one buffer the suite can read, which can be released, and
 * which records what it was asked for.
 *
 * @returns The allocator, its bytes, what it was asked for and how to release.
 */
const createHangarAllocator = (): {
	allocator: Allocator;
	bytes: () => Uint8Array;
	requests: [number, number][];
	release: () => void;
	detach: () => void;
} => {
	let buffer = new ArrayBuffer(4096);
	const requests: [number, number][] = [];
	let live = true;

	return {
		allocator: {
			allocate: (size: number, alignment: number): Allocation => {
				requests.push([size, alignment]);

				return { bytes: new DataView(buffer, 0, size), isLive: () => live };
			},
		},
		bytes: (): Uint8Array => new Uint8Array(buffer),
		requests,
		release: (): void => {
			live = false;
		},
		detach: (): void => {
			buffer = buffer.transfer();
		},
	};
};

const LENGTH = 6;

describe('StructureOfArrays', () => {
	it('should give back the values an array of structures gives, for every type a field can have', () => {
		const columns: Storage<Freighter> = createFixedBufferStorage(
			Freighter,
			LENGTH,
			StructureOfArrays,
		);

		const rows: Storage<Freighter> = createFixedBufferStorage(Freighter, LENGTH, ArrayOfStructures);

		for (let index = 0; index < LENGTH; index++) {
			columns.set(index, freighterAt(index));
			rows.set(index, freighterAt(index));
		}

		for (let index = 0; index < LENGTH; index++) {
			expect(Freighter.equals(columns.get(index), rows.get(index))).toBe(true);
			expect(Freighter.equals(columns.get(index), freighterAt(index))).toBe(true);
			expect(columns.get(index)).toEqual(rows.get(index));
		}
	});

	it('should read every position as the zero value until it is set', () => {
		const columns: Storage<Freighter> = createFixedBufferStorage(
			Freighter,
			LENGTH,
			StructureOfArrays,
		);

		const rows: Storage<Freighter> = createFixedBufferStorage(Freighter, LENGTH);

		expect(columns.get(LENGTH - 1)).toEqual(rows.get(LENGTH - 1));
	});

	it('should give a value read from the columns its methods', () => {
		const columns: Storage<Freighter> = createFixedBufferStorage(
			Freighter,
			LENGTH,
			StructureOfArrays,
		);

		columns.set(0, freighterAt(0));

		expect(columns.get(0).isFastEnough()).toBe(true);
		expect(Freighter.is(columns.get(0))).toBe(true);
	});

	it('should hold each field of every value together, one field after the other', () => {
		const hangar = createHangarAllocator();

		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			4,
			hangar.allocator,
			StructureOfArrays,
		);

		fleet.set(2, Starfighter.from({ shields: 1, hull: 2, speed: 3 }));

		const floats = new Float32Array(hangar.bytes().buffer, 0, 12);

		// shields of the four, then hull of the four, then speed of the four.
		expect([...floats]).toEqual([0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3, 0]);
	});

	it('should write each field in the same bytes an array of structures writes for it', () => {
		const hangar = createHangarAllocator();

		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			1,
			hangar.allocator,
			StructureOfArrays,
		);

		const lone = new DataView(new ArrayBuffer(Starfighter.layout.size));

		const redFive: Starfighter = Starfighter.from({ shields: 0.1, hull: -0, speed: Number.NaN });

		fleet.set(0, redFive);
		Starfighter.write(lone, 0, redFive);

		// With one value, each column is that value's field: the same bytes.
		expect([...hangar.bytes().subarray(0, 12)]).toEqual([...new Uint8Array(lone.buffer)]);
	});

	it('should ask for no tail padding, and the element alignment', () => {
		const hangar = createHangarAllocator();

		allocate(ScannerReading, 10, hangar.allocator, StructureOfArrays);
		allocate(ScannerReading, 10, hangar.allocator, ArrayOfStructures);

		expect(hangar.requests).toEqual([
			[90, 8],
			[160, 8],
		]);
	});

	it('should hold a type with no fields end to end, as an array of structures does', () => {
		const hangar = createHangarAllocator();

		const thermalReadings: Storage<SinglePrecisionFloat> = allocate(
			SinglePrecisionFloat,
			3,
			hangar.allocator,
			StructureOfArrays,
		);

		thermalReadings.set(1, SinglePrecisionFloat.from(0.5));

		expect(hangar.requests).toEqual([[12, 4]]);
		expect([...new Float32Array(hangar.bytes().buffer, 0, 3)]).toEqual([0, 0.5, 0]);
		expect(thermalReadings.get(1)).toBe(0.5);
	});

	it('should refuse what an array of structures refuses, with the same errors', () => {
		for (const layout of [StructureOfArrays, ArrayOfStructures]) {
			const fleet: Storage<Starfighter> = createFixedBufferStorage(Starfighter, 2, layout);

			expect(() => fleet.get(2)).toThrow(
				coded(
					new RangeError(
						'FULCRO7002: FixedBufferStorage.get: index 2 is outside a storage of length 2.',
					),
					{ operation: 'FixedBufferStorage.get', index: 2, length: 2 },
				),
			);

			expect(() => {
				fleet.set(0, { shields: 1, hull: 1, speed: 1 } as unknown as Starfighter);
			}).toThrow(
				coded(
					new TypeError(
						'FULCRO7004: FixedBufferStorage.set: the value is not a value of Starfighter.',
					),
					{
						operation: 'FixedBufferStorage.set',
						element: 'Starfighter',
					},
				),
			);
		}
	});

	it('should leave the bytes alone when it refuses a value', () => {
		const hangar = createHangarAllocator();

		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			2,
			hangar.allocator,
			StructureOfArrays,
		);

		expect(() => {
			fleet.set(0, { shields: 1, hull: 1, speed: 1 } as unknown as Starfighter);
		}).toThrow(TypeError);

		expect(
			hangar
				.bytes()
				.subarray(0, 24)
				.every((byte) => byte === 0),
		).toBe(true);
	});

	it('should refuse every access once its memory is released', () => {
		const hangar = createHangarAllocator();

		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			2,
			hangar.allocator,
			StructureOfArrays,
		);

		hangar.release();

		expect(() => fleet.get(0)).toThrow(
			coded(
				new Error(
					'FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.',
				),
				{ operation: 'Storage.get' },
			),
		);
	});

	it('should throw what an array of structures throws once its buffer is detached', () => {
		/**
		 * What a storage over a buffer that was then detached throws.
		 *
		 * @param layout The layout of the storage.
		 * @returns The class of what `get` and `set` threw.
		 */
		const thrownAfterDetaching = (layout: typeof StructureOfArrays): unknown[] => {
			const hangar = createHangarAllocator();
			const fleet: Storage<Starfighter> = allocate(Starfighter, 2, hangar.allocator, layout);

			hangar.detach();

			const thrown: unknown[] = [];

			try {
				fleet.get(0);
			} catch (error) {
				thrown.push((error as Error).constructor);
			}

			try {
				fleet.set(0, Starfighter.from({ shields: 1, hull: 1, speed: 1 }));
			} catch (error) {
				thrown.push((error as Error).constructor);
			}

			return thrown;
		};

		expect(thrownAfterDetaching(StructureOfArrays)).toEqual(
			thrownAfterDetaching(ArrayOfStructures),
		);

		expect(thrownAfterDetaching(StructureOfArrays)).toEqual([TypeError, TypeError]);
	});

	it('should be accepted by allocate from any allocator', () => {
		const fleet: Storage<Starfighter> = allocate(
			Starfighter,
			LENGTH,
			createManagedAllocator(),
			StructureOfArrays,
		);

		fleet.set(LENGTH - 1, Starfighter.from({ shields: 1, hull: 2, speed: 3 }));

		expect(fleet.get(LENGTH - 1)).toEqual({ shields: 1, hull: 2, speed: 3 });
	});

	it('should be frozen, and carry nothing a consumer can call', () => {
		expect(Object.isFrozen(StructureOfArrays)).toBe(true);
		expect({ ...StructureOfArrays }).toEqual({ name: 'StructureOfArrays' });
	});
});
