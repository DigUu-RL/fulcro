import { describe, expect, expectTypeOf, it } from 'vitest';

import {
	DoublePrecisionFloat,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import type { Allocation, Allocator } from '@/allocator';
import { createArenaAllocator } from '@/arenaAllocator';
import { createFixedBufferAllocator } from '@/fixedBufferAllocator';
import { createLinearMemory, type LinearMemory } from '@/linearMemory';
import { createManagedAllocator } from '@/managedAllocator';
import type { MemoryReference } from '@/memoryReference';
import type { NativePointer } from '@/nativePointer';
import { nativePointerTo } from '@/nativePointerTo';
import { createPoolAllocator } from '@/poolAllocator';
import { createStackAllocator } from '@/stackAllocator';

import { coded } from './coded';
import { instantiateRecordingModule } from './recordingModule';

/**
 * Behaviour suite for `nativePointerTo`, and for the `NativePointer<T>` it
 * returns.
 *
 * A native pointer is a byte address: it reads and writes the bytes there in
 * place, reaches a field or reinterprets the same bytes by moving in bytes,
 * keeps working across the memory growing, and refuses an address that is
 * outside, misaligned, or in memory an allocator took back.
 */

/** Eight bytes, aligned to eight. */
const Sample = struct('Sample', { value: DoublePrecisionFloat });
type Sample = Struct<typeof Sample>;

/** The same eight bytes, seen as two 32-bit words. */
const Words = struct('Words', {
	low: UnsignedInteger(32),
	high: UnsignedInteger(32),
});

const Point = struct('Point', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
});
type Point = Struct<typeof Point>;

const Particle = struct('Particle', { position: Point, velocity: Point });
type Particle = Struct<typeof Particle>;

/** One WebAssembly page, in bytes. */
const PAGE = 65_536;

/**
 * A linear memory over a fresh buffer of `bytes` bytes.
 *
 * @param bytes Its size.
 * @returns The memory and the buffer, to look at the bytes directly.
 */
const memoryOf = (
	bytes: number,
): { memory: LinearMemory; buffer: ArrayBuffer } => {
	const buffer = new ArrayBuffer(bytes);

	return { memory: createLinearMemory(buffer), buffer };
};

/**
 * What every byte a test did not mean to touch holds: a pattern no value
 * written here encodes to, so a stray write anywhere shows.
 */
const UNTOUCHED = 0xaa;

/**
 * A linear memory over a buffer of `bytes` bytes, every one of them
 * {@link UNTOUCHED}.
 *
 * @param bytes Its size.
 * @returns The memory and the buffer.
 */
const patternedMemoryOf = (
	bytes: number,
): { memory: LinearMemory; buffer: ArrayBuffer } => {
	const made = memoryOf(bytes);

	new Uint8Array(made.buffer).fill(UNTOUCHED);

	return made;
};

/**
 * The bytes of a buffer, read straight from it rather than through anything
 * this package made.
 *
 * @param buffer Buffer to read.
 * @param start First byte.
 * @param end Byte after the last.
 * @returns The bytes, as numbers.
 */
const bytesOf = (buffer: ArrayBuffer, start: number, end: number): number[] =>
	Array.from(new Uint8Array(buffer, start, end - start));

/**
 * Which addresses in `start` to `end` no longer hold {@link UNTOUCHED}.
 *
 * @param buffer Buffer to inspect.
 * @param start First address.
 * @param end Address after the last.
 * @returns The addresses that were written.
 */
const touchedIn = (buffer: ArrayBuffer, start: number, end: number): number[] =>
	bytesOf(buffer, start, end).flatMap((byte, index) =>
		byte === UNTOUCHED ? [] : [start + index],
	);

/** `1.5` as a little-endian 64-bit float, written out by hand. */
const ONE_AND_A_HALF = [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f];

describe('nativePointerTo a memory', () => {
	it('should read and write the value at its address, in place', () => {
		const { memory, buffer } = memoryOf(64);
		const pointer: NativePointer<Sample> = nativePointerTo(memory, 16, Sample);

		pointer.set(Sample.from({ value: 1.5 }));

		expect(pointer.memory).toBe(memory);
		expect(pointer.address).toBe(16);
		expect(new DataView(buffer).getFloat64(16, true)).toBe(1.5);

		new DataView(buffer).setFloat64(16, -2, true);

		expect(pointer.get().value).toBe(-2);
	});

	it('should read and write a field of a struct through a pointer to it, at the field’s bytes', () => {
		// A particle is two points of two 32-bit floats: position at bytes 0–7,
		// velocity at bytes 8–15. Written out rather than read from the layout,
		// so a wrong offset in it cannot agree with itself.
		const { memory, buffer } = memoryOf(64);
		const raw = new DataView(buffer);
		const particle: NativePointer<Particle> = nativePointerTo(
			memory,
			16,
			Particle,
		);
		const velocity: NativePointer<Point> = particle.at(8, Point);

		particle.set(
			Particle.from({
				position: Point.from({ x: 1, y: 2 }),
				velocity: Point.from({ x: 3, y: 4 }),
			}),
		);

		expect([16, 20, 24, 28].map((at) => raw.getFloat32(at, true))).toEqual([
			1, 2, 3, 4,
		]);

		velocity.set(Point.from({ x: 0, y: -10 }));

		expect(Particle.layout.fields.velocity.offset).toBe(8);
		expect(velocity.address).toBe(24);
		expect([16, 20, 24, 28].map((at) => raw.getFloat32(at, true))).toEqual([
			1, 2, 0, -10,
		]);

		raw.setFloat32(28, 6.5, true);

		expect(velocity.get().y).toBe(6.5);
		expect(particle.get().velocity.y).toBe(6.5);
		expect(particle.get().position.x).toBe(1);
	});

	it('should read the same bytes as another type', () => {
		const { memory, buffer } = memoryOf(16);
		const sample: NativePointer<Sample> = nativePointerTo(memory, 8, Sample);

		sample.set(Sample.from({ value: 1.5 }));

		expect(bytesOf(buffer, 8, 16)).toEqual(ONE_AND_A_HALF);

		const words = sample.at(0, Words).get();

		expect(words.low).toBe(0);
		expect(words.high).toBe(0x3ff8_0000);

		sample.at(0, Words).set(Words.from({ low: 0, high: 0x4000_0000 }));

		expect(new DataView(buffer).getFloat64(8, true)).toBe(2);
		expect(sample.get().value).toBe(2);
	});

	it('should move in bytes, keeping its type, and leave the pointer it came from', () => {
		const { memory, buffer } = patternedMemoryOf(64);
		const first: NativePointer<Sample> = nativePointerTo(memory, 0, Sample);
		const third: NativePointer<Sample> = first.at(2 * Sample.layout.size);

		third.set(Sample.from({ value: 1.5 }));

		expect(bytesOf(buffer, 16, 24)).toEqual(ONE_AND_A_HALF);
		expect(touchedIn(buffer, 0, 64)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
		expect(third.address).toBe(16);
		expect(third.at(-16).address).toBe(0);
		expect(first.address).toBe(0);
		expect(first.at(16).get().value).toBe(1.5);
	});

	it('should write exactly the value’s bytes, and leave every byte around them as it was', () => {
		const { memory, buffer } = patternedMemoryOf(64);

		nativePointerTo(memory, 24, Sample).set(Sample.from({ value: 1.5 }));

		expect(touchedIn(buffer, 0, 64)).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
		expect(bytesOf(buffer, 24, 32)).toEqual(ONE_AND_A_HALF);
	});

	it('should write only a field’s bytes through a pointer to that field', () => {
		const { memory, buffer } = patternedMemoryOf(64);

		nativePointerTo(memory, 16, Particle)
			.at(8, Point)
			.set(Point.from({ x: 0, y: 0 }));

		expect(touchedIn(buffer, 0, 64)).toEqual([24, 25, 26, 27, 28, 29, 30, 31]);
	});

	it('should change no byte when it reads', () => {
		const { memory, buffer } = patternedMemoryOf(32);
		const before: number[] = bytesOf(buffer, 0, 32);

		nativePointerTo(memory, 8, Sample).get();
		nativePointerTo(memory, 8, Particle).at(8, Point).get();

		expect(bytesOf(buffer, 0, 32)).toEqual(before);
	});

	it('should stand at the end of the memory, and refuse to read or write there', () => {
		const { memory } = memoryOf(16);
		const end: NativePointer<Sample> = nativePointerTo(memory, 16, Sample);

		expect(() => end.get()).toThrowError(
			coded(
				new RangeError(
					'FULCRO7021: NativePointer.get: the 8 bytes of Sample at address 16 run past 16, the end of where this pointer may read.',
				),
				{
					operation: 'NativePointer.get',
					address: 16,
					size: 8,
					element: 'Sample',
					end: 16,
				},
			),
		);
		expect(() => end.set(Sample.from({ value: 1 }))).toThrowError(
			expect.objectContaining({
				code: 'FULCRO7021',
				details: expect.objectContaining({ operation: 'NativePointer.set' }),
			}),
		);
	});

	it.each([
		[-8, -8],
		[24, 24],
		[1.5, 1.5],
		[Number.NaN, Number.NaN],
		['8', 'string'],
		[8n, 'bigint'],
	])('should refuse address %s in 16 bytes', (address, shown) => {
		const { memory } = memoryOf(16);

		expect(() =>
			nativePointerTo(memory, address as number, Sample),
		).toThrowError(
			coded(
				new RangeError(
					`FULCRO7019: nativePointerTo: address ${shown} is outside 0 to 16, where this pointer may point.`,
				),
				{ operation: 'nativePointerTo', address: shown, start: 0, end: 16 },
			),
		);
	});

	it('should refuse an address the type may not start at', () => {
		const { memory } = memoryOf(16);

		expect(() => nativePointerTo(memory, 4, Sample)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7020: nativePointerTo: address 4 is not a multiple of 8, where a value of Sample may start.',
				),
				{
					operation: 'nativePointerTo',
					address: 4,
					alignment: 8,
					element: 'Sample',
				},
			),
		);
		expect(() => nativePointerTo(memory, 0, Sample).at(4)).toThrowError(
			expect.objectContaining({
				code: 'FULCRO7020',
				details: expect.objectContaining({ operation: 'NativePointer.at' }),
			}),
		);
		expect(nativePointerTo(memory, 0, Sample).at(4, Point).address).toBe(4);
	});

	it('should refuse a move outside the memory', () => {
		const { memory } = memoryOf(16);

		expect(() => nativePointerTo(memory, 8, Sample).at(-16)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7019: NativePointer.at: address -8 is outside 0 to 16, where this pointer may point.',
				),
				{ operation: 'NativePointer.at', address: -8, start: 0, end: 16 },
			),
		);
	});

	it('should refuse a value of another type', () => {
		const { memory } = memoryOf(16);

		expect(() =>
			nativePointerTo(memory, 0, Sample).set(
				Point.from({ x: 1, y: 1 }) as unknown as Sample,
			),
		).toThrowError(
			coded(
				new TypeError(
					'FULCRO7004: NativePointer.set: the value is not a value of Sample.',
				),
				{ operation: 'NativePointer.set', element: 'Sample' },
			),
		);
	});

	it('should refuse an element type without a layout alignment', () => {
		const { memory } = memoryOf(16);
		const unaligned = {
			name: 'Unaligned',
			layout: { size: 4 },
			read: (): number => 0,
			write: (): void => undefined,
			is: (value: unknown): value is number => typeof value === 'number',
		};

		expect(() =>
			nativePointerTo(memory, 0, unaligned as unknown as typeof Sample),
		).toThrowError(
			coded(
				new RangeError(
					'FULCRO7006: nativePointerTo: expected an alignment that is a positive power of two, received undefined.',
				),
				{ operation: 'nativePointerTo', received: 'undefined' },
			),
		);
		expect(() =>
			nativePointerTo(memory, 0, {} as unknown as typeof Sample),
		).toThrowError(expect.objectContaining({ code: 'FULCRO7003' }));
	});

	it('should refuse to read past the end of a buffer that shrank', () => {
		const buffer = new ArrayBuffer(16, { maxByteLength: 16 });
		const pointer: NativePointer<Sample> = nativePointerTo(
			createLinearMemory(buffer),
			8,
			Sample,
		);

		buffer.resize(8);

		expect(() => pointer.get()).toThrowError(
			expect.objectContaining({
				code: 'FULCRO7021',
				details: expect.objectContaining({ end: 8 }),
			}),
		);
	});

	it('should be frozen, its methods working taken off it', () => {
		const { memory } = memoryOf(16);
		const pointer: NativePointer<Sample> = nativePointerTo(memory, 0, Sample);
		const { get, set, at } = pointer;

		set(Sample.from({ value: 5 }));

		expect(Object.isFrozen(pointer)).toBe(true);
		expect(get().value).toBe(5);
		expect(at(8).address).toBe(8);
	});
});

describe('nativePointerTo a WebAssembly memory', () => {
	it('should read what the module wrote, with no copy, and write where the module reads', () => {
		const module = instantiateRecordingModule();
		const memory: LinearMemory = createLinearMemory(module.memory);
		const pointer: NativePointer<Sample> = nativePointerTo(memory, 8, Sample);

		module.store(8, 2.5);

		expect(pointer.get().value).toBe(2.5);

		pointer.set(Sample.from({ value: 1.5 }));

		expect(bytesOf(module.memory.buffer, 0, 24)).toEqual([
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			...ONE_AND_A_HALF,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
		]);
	});

	it('should write into the grown memory, not the buffer it replaced', () => {
		const module = instantiateRecordingModule();
		const pointer: NativePointer<Sample> = nativePointerTo(
			createLinearMemory(module.memory),
			8,
			Sample,
		);

		module.grow(1);
		pointer.set(Sample.from({ value: 1.5 }));

		expect(bytesOf(module.memory.buffer, 8, 16)).toEqual(ONE_AND_A_HALF);
		expect(module.memory.buffer.byteLength).toBe(2 * PAGE);
	});

	it('should keep working after the module grows its memory', () => {
		const module = instantiateRecordingModule();
		const memory: LinearMemory = createLinearMemory(module.memory);
		const early: NativePointer<Sample> = nativePointerTo(memory, 8, Sample);
		const before: ArrayBuffer = module.memory.buffer;

		module.store(8, 1.25);
		module.grow(1);

		expect(before.byteLength).toBe(0);
		expect(early.get().value).toBe(1.25);

		const late: NativePointer<Sample> = nativePointerTo(
			memory,
			PAGE + 8,
			Sample,
		);

		module.store(PAGE + 8, 9.5);

		expect(late.get().value).toBe(9.5);
		expect(early.at(PAGE).get().value).toBe(9.5);
	});
});

describe('nativePointerTo an allocation', () => {
	// Where the second allocation starts, worked out from each strategy's own
	// rule rather than read back from the allocation: managed gives it a buffer
	// of its own, the bump allocators put it after the first eight bytes, and
	// the pool hands out the second 64-byte block.
	it.each<[string, () => Allocator, number, number]>([
		['managed', () => createManagedAllocator(), 0, 16],
		['arena', () => createArenaAllocator(256), 8, 256],
		['stack', () => createStackAllocator(256), 8, 256],
		[
			'fixed buffer',
			() => createFixedBufferAllocator(new ArrayBuffer(256)),
			8,
			256,
		],
		['pool', () => createPoolAllocator(64, 4), 64, 256],
	])(
		'should point at the first byte of a %s allocation, and write the bytes the allocator lent',
		(_, makeAllocator, address, memoryLength) => {
			const allocator: Allocator = makeAllocator();

			allocator.allocate(8, 8);

			const allocation: Allocation = allocator.allocate(16, 8);
			const pointer: NativePointer<Sample> = nativePointerTo(
				allocation,
				Sample,
			);

			pointer.at(8).set(Sample.from({ value: 1.5 }));

			expect(pointer.address).toBe(address);
			expect(pointer.memory.byteLength).toBe(memoryLength);
			expect(
				bytesOf(allocation.bytes.buffer as ArrayBuffer, address, address + 16),
			).toEqual([0, 0, 0, 0, 0, 0, 0, 0, ...ONE_AND_A_HALF]);

			allocation.bytes.setFloat64(0, -3, true);

			expect(pointer.get().value).toBe(-3);
		},
	);

	it('should write inside its allocation only, in the buffer the caller handed the allocator', () => {
		const buffer = new ArrayBuffer(64);
		const allocator = createFixedBufferAllocator(buffer);

		allocator.allocate(8, 8);

		const pointer: NativePointer<Sample> = nativePointerTo(
			allocator.allocate(16, 8),
			Sample,
		);

		allocator.allocate(8, 8);
		new Uint8Array(buffer).fill(UNTOUCHED);

		pointer.set(Sample.from({ value: 1.5 }));
		pointer.at(8).set(Sample.from({ value: 1.5 }));

		expect(touchedIn(buffer, 0, 64)).toEqual([
			8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
		]);
		expect(bytesOf(buffer, 8, 24)).toEqual([
			...ONE_AND_A_HALF,
			...ONE_AND_A_HALF,
		]);
	});

	it('should reach only the allocation, its end included', () => {
		const allocator = createFixedBufferAllocator(new ArrayBuffer(64));

		allocator.allocate(8, 8);

		const pointer: NativePointer<Sample> = nativePointerTo(
			allocator.allocate(16, 8),
			Sample,
		);

		expect(pointer.at(16).address).toBe(24);
		expect(() => pointer.at(24)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7019: NativePointer.at: address 32 is outside 8 to 24, where this pointer may point.',
				),
				{ operation: 'NativePointer.at', address: 32, start: 8, end: 24 },
			),
		);
		expect(() => pointer.at(-8)).toThrowError(
			expect.objectContaining({
				code: 'FULCRO7019',
				details: expect.objectContaining({ address: 0, start: 8 }),
			}),
		);
		expect(() => pointer.at(16).get()).toThrowError(
			expect.objectContaining({ code: 'FULCRO7021' }),
		);
	});

	it('should refuse every access once the allocator released the memory, through every pointer moved from it', () => {
		const arena = createArenaAllocator(64);
		const pointer: NativePointer<Sample> = nativePointerTo(
			arena.allocate(16, 8),
			Sample,
		);
		const second: NativePointer<Sample> = pointer.at(8);

		arena.reset();
		arena.allocate(16, 8);

		const released = (operation: string): Error =>
			coded(
				new Error(
					`FULCRO7009: ${operation}: the memory was released by its allocator, and may already hold other values.`,
				),
				{ operation },
			);

		expect(() => pointer.get()).toThrowError(released('NativePointer.get'));
		expect(() => second.set(Sample.from({ value: 1 }))).toThrowError(
			released('NativePointer.set'),
		);
	});

	it('should refuse an allocation that does not start where the type may', () => {
		const allocator = createFixedBufferAllocator(new ArrayBuffer(64));

		allocator.allocate(1, 1);

		expect(() =>
			nativePointerTo(allocator.allocate(8, 1), Sample),
		).toThrowError(
			coded(
				new RangeError(
					'FULCRO7020: nativePointerTo: address 1 is not a multiple of 8, where a value of Sample may start.',
				),
				{
					operation: 'nativePointerTo',
					address: 1,
					alignment: 8,
					element: 'Sample',
				},
			),
		);
	});

	it('should refuse an allocation over shared memory', () => {
		const shared: Allocation = {
			bytes: new DataView(new SharedArrayBuffer(8)),
			isLive: () => true,
		};

		expect(() => nativePointerTo(shared, Sample)).toThrowError(
			coded(
				new TypeError(
					'FULCRO7018: nativePointerTo: expected an ArrayBuffer or a WebAssembly.Memory that is not shared, received SharedArrayBuffer.',
				),
				{ operation: 'nativePointerTo', received: 'SharedArrayBuffer' },
			),
		);
	});
});

describe('nativePointerTo something else', () => {
	it.each([
		['an ArrayBuffer', new ArrayBuffer(8), 'ArrayBuffer'],
		['an object', {}, 'Object'],
		['null', null, 'null'],
		['a number', 0, 'number'],
	])('should refuse %s', (_, target, received) => {
		expect(() =>
			nativePointerTo(target as unknown as Allocation, Sample),
		).toThrowError(
			coded(
				new TypeError(
					`FULCRO7022: nativePointerTo: expected a linear memory or an allocation, received ${received}.`,
				),
				{ operation: 'nativePointerTo', received },
			),
		);
	});
});

describe('nativePointerTo types', () => {
	it('should infer the type at the address, and be a memory reference', () => {
		const { memory } = memoryOf(16);
		const pointer = nativePointerTo(memory, 0, Sample);

		expectTypeOf(pointer).toEqualTypeOf<NativePointer<Sample>>();
		expectTypeOf(
			nativePointerTo(createManagedAllocator().allocate(8, 8), Sample),
		).toEqualTypeOf<NativePointer<Sample>>();
		expectTypeOf(pointer.at(8)).toEqualTypeOf<NativePointer<Sample>>();
		expectTypeOf(pointer.at(0, Point)).toEqualTypeOf<NativePointer<Point>>();
		expectTypeOf<NativePointer<Sample>>().toExtend<MemoryReference<Sample>>();
	});
});
