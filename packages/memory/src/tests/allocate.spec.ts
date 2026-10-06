import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/allocate';
import type { Allocation, Allocator } from '@/allocator';
import { createArenaAllocator } from '@/arenaAllocator';
import { createFixedBufferAllocator } from '@/fixedBufferAllocator';
import { createManagedAllocator } from '@/managedAllocator';
import { createPoolAllocator } from '@/poolAllocator';
import { createStackAllocator } from '@/stackAllocator';
import type { Storage } from '@/storage';

import { coded } from './coded';

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
		pool.deallocate(leases[0] as Allocation);

		for (const particles of released) {
			expect(() => particles.get(0)).toThrowError(
				coded(
					new Error(
						'FULCRO7009: Storage.get: the memory was released by its allocator, and may already hold other values.',
					),
					{ operation: 'Storage.get' },
				),
			);
			expect(() =>
				particles.set(0, Particle.from({ x: 1, y: 1 })),
			).toThrowError(
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

		expect(() => before.get(0)).toThrowError(Error);
		expect(after.get(0)).toEqual({ x: 7, y: 7 });
	});

	it('should keep working under the managed allocator for as long as it is held', () => {
		const samples = allocate(Sample, 4, createManagedAllocator());

		samples.set(3, Sample.from({ value: 0.5, channel: 1 }));

		expect(samples.get(3)).toEqual({ value: 0.5, channel: 1 });
	});

	it('should refuse a value its element type does not recognise', () => {
		const particles = allocate(Particle, 1, createManagedAllocator());

		expect(() =>
			particles.set(0, { x: 1, y: 1 } as unknown as Particle),
		).toThrowError(
			coded(
				new TypeError(
					'FULCRO7004: Storage.set: the value is not a value of Particle.',
				),
				{ operation: 'Storage.set', element: 'Particle' },
			),
		);
	});

	it('should refuse an index outside it', () => {
		expect(() =>
			allocate(Particle, 2, createManagedAllocator()).get(2),
		).toThrowError(
			coded(
				new RangeError(
					'FULCRO7002: Storage.get: index 2 is outside a storage of length 2.',
				),
				{ operation: 'Storage.get', index: 2, length: 2 },
			),
		);
	});

	it('should refuse an element type it cannot store, before asking for memory', () => {
		const { allocator, requests } = createLedgerAllocator();

		expect(() =>
			allocate(
				{
					name: 'T',
					layout: { size: 4, alignment: 4 },
				} as unknown as typeof Particle,
				1,
				allocator,
			),
		).toThrowError(
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

			expect(() => allocate(element, 1, allocator)).toThrowError(
				coded(
					new RangeError(
						`FULCRO7006: allocate: expected an alignment that is a positive power of two, received ${shown}.`,
					),
					{
						operation: 'allocate',
						received: alignment === undefined ? 'undefined' : alignment,
					},
				),
			);
			expect(requests).toEqual([]);
		},
	);

	it('should refuse a length that is not a count, before asking for memory', () => {
		const { allocator, requests } = createLedgerAllocator();

		expect(() => allocate(Particle, -1, allocator)).toThrowError(
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
		expect(() => allocate(Particle, 3, createStackAllocator(16))).toThrowError(
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

	it('should infer the struct it stores', () => {
		expectTypeOf(allocate(Particle, 1, createManagedAllocator())).toEqualTypeOf<
			Storage<Particle>
		>();
		expectTypeOf(allocate(Particle, 1, createManagedAllocator()).set)
			.parameter(1)
			.toEqualTypeOf<Particle>();
		expectTypeOf(createStackAllocator(8).enter()).toMatchTypeOf<
			Parameters<typeof allocate>[2]
		>();
	});
});
