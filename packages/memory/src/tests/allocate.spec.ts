import { assert, describe, expect, expectTypeOf, it } from 'vitest';

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
import { createArenaAllocator } from '@/src/arenaAllocator';
import { createFixedBufferAllocator } from '@/src/fixedBufferAllocator';
import { createManagedAllocator } from '@/src/managedAllocator';
import { createPoolAllocator } from '@/src/poolAllocator';
import { createStackAllocator } from '@/src/stackAllocator';
import type { Storage } from '@/src/storage';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for `allocate`.
 *
 * The storage it returns honours the `Storage<T>` contract — that suite runs
 * over it too — so what is here is the part an allocator adds: the bytes come
 * from the allocator the caller chose, aligned to the element, and the
 * storage stops working the moment its memory is released.
 */

const Particle = struct('Particle', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});

type Particle = Struct<typeof Particle>;

/** Sixteen bytes aligned to eight: misplacing it shows. */
const Sample = struct('Sample', {
	value: DoublePrecisionFloat,
	channel: UnsignedInteger(8),
});

/**
 * An allocator written outside the package, knowing only the contract: every
 * allocation is a slice of one buffer, and `release` ends them all.
 *
 * @returns The allocator, and how to release what it handed out.
 */
const createLedgerAllocator = (): {
	allocator: Allocator;
	requests: [number, number][];
	release: () => void;
} => {
	const buffer = new ArrayBuffer(1024);
	const requests: [number, number][] = [];
	let live = true;
	let offset = 0;

	return {
		requests,
		release: (): void => {
			live = false;
		},
		allocator: {
			allocate: (size: number, alignment: number): Allocation => {
				requests.push([size, alignment]);
				offset = Math.ceil(offset / alignment) * alignment;

				const bytes = new DataView(buffer, offset, size);

				offset += size;

				return { bytes, isLive: (): boolean => live };
			},
		},
	};
};

describe('allocate', () => {
	it('should ask the allocator for length × size bytes, aligned to the element', () => {
		const { allocator, requests } = createLedgerAllocator();

		allocate(Sample, 10, allocator);

		expect(requests).toEqual([[160, 8]]);
	});

	it('should take its bytes from an allocator written outside the package', () => {
		const { allocator } = createLedgerAllocator();
		const particles: Storage<Particle> = allocate(Particle, 3, allocator);

		particles.set(2, Particle.from({ x: 1, y: 2 }));

		expect(particles.get(2)).toEqual({ x: 1, y: 2 });
		expect(particles.length).toBe(3);
	});

	it('should read every position as the zero value before it is set', () => {
		const particles = allocate(Particle, 2, createArenaAllocator(64));

		expect(particles.get(1)).toEqual({ x: 0, y: 0 });
	});

	it('should keep values apart from what else the allocator handed out', () => {
		const arena = createArenaAllocator(256);
		const first = allocate(Sample, 2, arena);
		const raw: Allocation = arena.allocate(3, 1);
		const second = allocate(Sample, 2, arena);

		first.set(1, Sample.from({ value: 1.5, channel: 9 }));
		new Uint8Array(raw.bytes.buffer, raw.bytes.byteOffset, 3).fill(0xff);
		second.set(0, Sample.from({ value: -2, channel: 4 }));

		expect(first.get(1)).toEqual({ value: 1.5, channel: 9 });
		expect(second.get(0)).toEqual({ value: -2, channel: 4 });
	});

	it('should refuse every access once its memory was released, whichever way', () => {
		const arena = createArenaAllocator(64);
		const fixed = createFixedBufferAllocator(new ArrayBuffer(16));
		const frame = createStackAllocator(64).enter();
		const pool = createPoolAllocator(8, 1);

		// The pool takes back one allocation, so the one `allocate` asked it for
		// is kept on the way through.
		const leases: Allocation[] = [];

		const recordingPool: Allocator = {
			allocate: (size: number, alignment: number): Allocation => {
				const allocation: Allocation = pool.allocate(size, alignment);

				leases.push(allocation);

				return allocation;
			},
		};

		const released: Storage<Particle>[] = [
			allocate(Particle, 1, arena),
			allocate(Particle, 1, fixed),
			allocate(Particle, 1, frame),
			allocate(Particle, 1, recordingPool),
		];

		arena.reset();
		fixed.reset();
		frame[Symbol.dispose]();

		const [lease] = leases;

		assert.isDefined(lease);
		pool.deallocate(lease);

		for (const particles of released) {
			expect(() => particles.get(0)).toThrow(
				coded(
					new Error(
						'FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.',
					),
					{ operation: 'Storage.get' },
				),
			);

			expect(() => {
				particles.set(0, Particle.from({ x: 1, y: 1 }));
			}).toThrow(
				coded(
					new Error(
						'FULCRO7009: Storage.set: the memory was released by its allocator, and may already hold other values.',
					),
					{ operation: 'Storage.set' },
				),
			);
		}
	});

	it('should not read what was written into its memory after it was released', () => {
		const arena = createArenaAllocator(64);
		const before = allocate(Particle, 1, arena);

		arena.reset();

		const after = allocate(Particle, 1, arena);

		after.set(0, Particle.from({ x: 7, y: 7 }));

		expect(() => before.get(0)).toThrow(Error);
		expect(after.get(0)).toEqual({ x: 7, y: 7 });
	});

	it('should keep working under the managed allocator for as long as it is held', () => {
		const samples = allocate(Sample, 4, createManagedAllocator());

		samples.set(3, Sample.from({ value: 0.5, channel: 1 }));

		expect(samples.get(3)).toEqual({ value: 0.5, channel: 1 });
	});

	it('should refuse a value its element type does not recognise', () => {
		const particles = allocate(Particle, 1, createManagedAllocator());

		expect(() => {
			particles.set(0, { x: 1, y: 1 } as unknown as Particle);
		}).toThrow(
			coded(new TypeError('FULCRO7004: Storage.set: the value is not a value of Particle.'), {
				operation: 'Storage.set',
				element: 'Particle',
			}),
		);
	});

	it('should refuse an index outside it', () => {
		expect(() => allocate(Particle, 2, createManagedAllocator()).get(2)).toThrow(
			coded(new RangeError('FULCRO7002: Storage.get: index 2 is outside a storage of length 2.'), {
				operation: 'Storage.get',
				index: 2,
				length: 2,
			}),
		);
	});

	it('should refuse an element type it cannot store, before asking for memory', () => {
		const { allocator, requests } = createLedgerAllocator();

		expect(() => {
			return allocate(
				{
					name: 'T',
					layout: { size: 4, alignment: 4 },
				} as unknown as typeof Particle,
				1,
				allocator,
			);
		}).toThrow(
			coded(
				new TypeError(
					'FULCRO7003: allocate: expected an element type with a name, layout.size, read, write and is; read is missing.',
				),
				{ operation: 'allocate', missing: 'read' },
			),
		);

		expect(requests).toEqual([]);
	});

	it.each([
		[undefined, 'undefined'],
		[3, '3'],
		[0, '0'],
	])(
		'should refuse an element whose alignment is %s, before asking for memory',
		(alignment, shown) => {
			const { allocator, requests } = createLedgerAllocator();

			const element = {
				...Particle,
				layout: { size: Particle.layout.size, alignment },
			} as unknown as typeof Particle;

			expect(() => allocate(element, 1, allocator)).toThrow(
				coded(
					new RangeError(
						`FULCRO7006: allocate: expected an alignment that is a positive power of two, received ${shown}.`,
					),
					{
						operation: 'allocate',
						received: alignment ?? 'undefined',
					},
				),
			);

			expect(requests).toEqual([]);
		},
	);

	it('should refuse a length that is not a count, before asking for memory', () => {
		const { allocator, requests } = createLedgerAllocator();

		expect(() => allocate(Particle, -1, allocator)).toThrow(
			coded(
				new RangeError(
					'FULCRO7001: allocate: expected a length that is a non-negative safe integer, received -1.',
				),
				{ operation: 'allocate', received: -1 },
			),
		);

		expect(requests).toEqual([]);
	});

	it('should pass on the allocator’s refusal when it has no room', () => {
		expect(() => allocate(Particle, 3, createStackAllocator(16))).toThrow(
			coded(
				new RangeError(
					'FULCRO7007: StackAllocator.allocate: 24 bytes aligned to 4 were requested, but only 16 of 16 bytes remain.',
				),
				{
					operation: 'StackAllocator.allocate',
					requested: 24,
					alignment: 4,
					available: 16,
					capacity: 16,
				},
			),
		);
	});

	it('should store a numeric type alone, end to end, little-endian, with its own alignment', () => {
		const { allocator, requests } = createLedgerAllocator();
		const Int32 = SignedInteger(32);
		const numbers: Storage<SignedInteger<32>> = allocate(Int32, 4, allocator);

		numbers.set(1, Int32.from(-2));
		numbers.set(3, Int32.maximum);

		expect(requests).toEqual([[16, 4]]);

		expect([numbers.get(0), numbers.get(1), numbers.get(2), numbers.get(3)]).toEqual([
			0, -2, 0, 2_147_483_647,
		]);
	});

	it.each([
		['SignedInteger<8>', SignedInteger(8), -128],
		['UnsignedInteger<64>', UnsignedInteger(64), 2n ** 64n - 1n],
		['SignedInteger<128>', SignedInteger(128), -(2n ** 127n)],
		['HalfPrecisionFloat', HalfPrecisionFloat, -65_504],
		['SinglePrecisionFloat', SinglePrecisionFloat, 0.1],
		['DoublePrecisionFloat', DoublePrecisionFloat, Number.MIN_VALUE],
	] as const)('should hold %s and give back the value it was handed', (_name, type, source) => {
		const { allocator, requests } = createLedgerAllocator();
		const element = type as unknown as typeof Particle;
		const value = (type.from as (value: number | bigint) => unknown)(source);
		const values = allocate(element, 3, allocator) as unknown as Storage<unknown>;

		values.set(2, value);

		expect(requests).toEqual([[3 * type.layout.size, type.layout.alignment]]);
		expect(values.get(2)).toBe(value);
	});

	it('should hold a Decimal as decimal128', () => {
		const amounts: Storage<Decimal> = allocate(Decimal, 2, createArenaAllocator(64));

		amounts.set(1, Decimal.from('-19.99'));

		expect(amounts.get(1).toString()).toBe('-19.99');
		expect(amounts.get(0).isZero()).toBe(true);
	});

	it('should refuse a number outside the numeric type, naming it', () => {
		const numbers = allocate(SignedInteger(8), 1, createManagedAllocator());

		expect(() => {
			numbers.set(0, 128 as SignedInteger<8>);
		}).toThrow(
			coded(
				new TypeError('FULCRO7004: Storage.set: the value is not a value of SignedInteger<8>.'),
				{ operation: 'Storage.set', element: 'SignedInteger<8>' },
			),
		);
	});

	it('should infer the numeric type it stores', () => {
		expectTypeOf(allocate(SignedInteger(32), 1, createManagedAllocator())).toEqualTypeOf<
			Storage<SignedInteger<32>>
		>();

		expectTypeOf(allocate(Decimal, 1, createManagedAllocator())).toEqualTypeOf<Storage<Decimal>>();
	});

	it('should infer the struct it stores', () => {
		expectTypeOf(allocate(Particle, 1, createManagedAllocator())).toEqualTypeOf<
			Storage<Particle>
		>();

		expectTypeOf(allocate(Particle, 1, createManagedAllocator()))
			.toHaveProperty('set')
			.parameter(1)
			.toEqualTypeOf<Particle>();

		expectTypeOf(createStackAllocator(8).enter()).toExtend<Parameters<typeof allocate>[2]>();
	});
});
