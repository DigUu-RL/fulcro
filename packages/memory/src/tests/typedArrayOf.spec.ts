import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import {
	Decimal,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/src/allocate';
import type { Allocation, Allocator } from '@/src/allocator';
import { typedArrayOf } from '@/src/byteStorage/typedArrayOf';
import type { AlignedElement } from '@/src/element';
import { createFixedBufferAllocator, type FixedBufferAllocator } from '@/src/fixedBufferAllocator';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import type { Storage } from '@/src/storage';
import { thrownBy } from '@/src/tests/thrownBy';

/**
 * Behaviour suite for `typedArrayOf`, and for the storages that hold their
 * values in the typed array it picks.
 *
 * The specialisation must not be observable but in what it costs, so every
 * case runs twice: once over the element type as it is, which names its
 * encoding, and once over the same type with the encoding taken off its
 * layout, which is read and written through the element as before. The two
 * have to give back the same values, leave the same bytes in a buffer the
 * caller can see, and refuse with the same errors.
 */

/** The numeric types whose encoding has a typed array, with the values at their edges. */
const SPECIALISED = [
	['SignedInteger<8>', SignedInteger(8), [-128, -1, 0, 1, 127]],
	['UnsignedInteger<8>', UnsignedInteger(8), [0, 1, 128, 255]],
	['SignedInteger<16>', SignedInteger(16), [-32_768, -1, 0, 1, 32_767]],
	['UnsignedInteger<16>', UnsignedInteger(16), [0, 1, 0x80_00, 0xff_ff]],
	['SignedInteger<32>', SignedInteger(32), [-(2 ** 31), -1, 0, 1, 2 ** 31 - 1]],
	['UnsignedInteger<32>', UnsignedInteger(32), [0, 1, 2 ** 31, 2 ** 32 - 1]],
	['SignedInteger<64>', SignedInteger(64), [-(2n ** 63n), -1n, 0n, 1n, 2n ** 63n - 1n]],
	['UnsignedInteger<64>', UnsignedInteger(64), [0n, 1n, 2n ** 63n, 2n ** 64n - 1n]],
	[
		'SinglePrecisionFloat',
		SinglePrecisionFloat,
		[NaN, -0, 0, Infinity, -Infinity, 2 ** -149, 3.4028234663852886e38, 0.1],
	],
	[
		'DoublePrecisionFloat',
		DoublePrecisionFloat,
		[NaN, -0, 0, Infinity, -Infinity, Number.MIN_VALUE, Number.MAX_VALUE, 0.1],
	],
] as const;

/** What a case below needs of an element type, whatever its values are. */
type AnyElement = AlignedElement<unknown> & { readonly from: (value: never) => unknown };

/**
 * The same element type with no encoding on its layout: what a storage reads
 * and writes through `read` and `write`, as it did before it could specialise.
 *
 * @param element Element type to copy.
 * @returns The copy.
 */
const withoutEncoding = <T>(element: AlignedElement<T>): AlignedElement<T> => {
	const { size, alignment } = element.layout;

	return { ...element, layout: { size, alignment } };
};

/**
 * Two storages of the same element type, each over a buffer of its own that
 * the caller keeps: one specialised, one not.
 *
 * Untyped on purpose: the refusals below hand each storage values its type
 * would not compile with.
 *
 * @param type Element type, naming its encoding.
 * @param length How many values each holds.
 * @param options Options of the buffers, to make them resizable.
 * @returns The storages, their buffers and their allocators.
 */
const pairOf = (
	type: object,
	length: number,
	options?: { maxByteLength: number },
): {
	storages: readonly [Storage<unknown>, Storage<unknown>];
	buffers: readonly [ArrayBuffer, ArrayBuffer];
	allocators: readonly [FixedBufferAllocator, FixedBufferAllocator];
} => {
	const element = type as AlignedElement<unknown>;
	const bytes: number = length * element.layout.size;
	const buffers = [new ArrayBuffer(bytes, options), new ArrayBuffer(bytes, options)] as const;

	const allocators = [
		createFixedBufferAllocator(buffers[0]),
		createFixedBufferAllocator(buffers[1]),
	] as const;

	return {
		storages: [
			allocate(element, length, allocators[0]),
			allocate(withoutEncoding(element), length, allocators[1]),
		],
		buffers,
		allocators,
	};
};

/**
 * What a call threw, reduced to what a consumer can tell apart.
 *
 * @param call Call expected to throw.
 * @returns The class, the message, and the code with its details when there is one.
 */
const refusalOf = (call: () => unknown): unknown => {
	const error: unknown = thrownBy(call);

	assert.instanceOf(error, Error);

	const { code, details } = error as Error & { code?: unknown; details?: unknown };

	return { type: error.constructor, message: error.message, code, details };
};

afterEach(() => {
	vi.doUnmock('@/src/byteStorage/platformEndianness');
	vi.resetModules();
});

describe('typedArrayOf', () => {
	it.each([
		['SignedInteger<8>', SignedInteger(8), Int8Array],
		['UnsignedInteger<8>', UnsignedInteger(8), Uint8Array],
		['SignedInteger<16>', SignedInteger(16), Int16Array],
		['UnsignedInteger<16>', UnsignedInteger(16), Uint16Array],
		['SignedInteger<32>', SignedInteger(32), Int32Array],
		['UnsignedInteger<32>', UnsignedInteger(32), Uint32Array],
		['SignedInteger<64>', SignedInteger(64), BigInt64Array],
		['UnsignedInteger<64>', UnsignedInteger(64), BigUint64Array],
		['SinglePrecisionFloat', SinglePrecisionFloat, Float32Array],
		['DoublePrecisionFloat', DoublePrecisionFloat, Float64Array],
	] as const)(
		'should hold %s in the typed array of its encoding, over exactly its bytes',
		(_name, type, TypedArray) => {
			const buffer = new ArrayBuffer(64);
			const view = new DataView(buffer, 16, 3 * type.layout.size);
			const elements = typedArrayOf(type.layout, 3, view);

			expect(elements).toBeInstanceOf(TypedArray);

			const { buffer: reached, byteOffset, byteLength } = elements as unknown as ArrayBufferView;

			expect([reached, byteOffset, byteLength]).toEqual([buffer, 16, view.byteLength]);
		},
	);

	it.each([
		['HalfPrecisionFloat', HalfPrecisionFloat.layout],
		['SignedInteger<128>', SignedInteger(128).layout],
		['UnsignedInteger<128>', UnsignedInteger(128).layout],
		['Decimal', Decimal.layout],
		['a struct', struct('Pair', { left: SignedInteger(32), right: SignedInteger(32) }).layout],
		['an encoding the language does not have', { size: 4, alignment: 4, encoding: 'Int33' }],
		['an encoding named by a prototype key', { size: 4, alignment: 4, encoding: 'constructor' }],
		['an encoding that is not a string', { size: 4, alignment: 4, encoding: 32 }],
	])('should hold %s in none', (_name, layout) => {
		const view = new DataView(new ArrayBuffer(64));

		expect(typedArrayOf(layout as { size: number }, 2, view)).toBeUndefined();
	});

	it('should hold none when the size carries padding the typed array would not', () => {
		const view = new DataView(new ArrayBuffer(64));

		expect(typedArrayOf({ size: 8, encoding: 'Int32' }, 2, view)).toBeUndefined();
	});

	it('should hold none when the bytes do not start on a multiple of the size', () => {
		const view = new DataView(new ArrayBuffer(64), 2, 8);

		expect(typedArrayOf(SignedInteger(32).layout, 2, view)).toBeUndefined();
	});

	it('should hold only single bytes on a platform that is not little-endian', async () => {
		vi.doMock('@/src/byteStorage/platformEndianness', () => ({ platformIsLittleEndian: false }));
		vi.resetModules();

		const { typedArrayOf: onBigEndian } = await import('@/src/byteStorage/typedArrayOf');
		const view = new DataView(new ArrayBuffer(64));

		expect(onBigEndian(SignedInteger(8).layout, 2, view)).toBeInstanceOf(Int8Array);
		expect(onBigEndian(UnsignedInteger(8).layout, 2, view)).toBeInstanceOf(Uint8Array);
		expect(onBigEndian(SignedInteger(16).layout, 2, view)).toBeUndefined();
		expect(onBigEndian(DoublePrecisionFloat.layout, 2, view)).toBeUndefined();
	});
});

describe('a storage held in a typed array', () => {
	it.each(SPECIALISED)(
		'should give back every value of %s it was handed, and leave the bytes it would have left without one',
		(_name, type, sources) => {
			const element = type as unknown as AnyElement;
			const values: unknown[] = sources.map((source) => element.from(source as never));
			const { storages, buffers } = pairOf(element, values.length);

			for (const storage of storages) {
				values.forEach((value, index) => {
					storage.set(index, value);
				});
			}

			for (const storage of storages) {
				values.forEach((value, index) => {
					expect(storage.get(index)).toBe(value);
				});
			}

			expect(new Uint8Array(buffers[0])).toEqual(new Uint8Array(buffers[1]));
		},
	);

	it.each(SPECIALISED)(
		'should read %s back from bytes written without it, little-endian',
		(_name, type, sources) => {
			const element = type as unknown as AnyElement;
			const values: unknown[] = sources.map((source) => element.from(source as never));
			const buffer = new ArrayBuffer(values.length * element.layout.size);
			const view = new DataView(buffer);

			values.forEach((value, index) => {
				element.write(view, index * element.layout.size, value);
			});

			const storage = allocate(element, values.length, createFixedBufferAllocator(buffer));

			// The allocator zeroes what it hands out, so the values are written
			// again behind its back, as another reader of the buffer would.
			values.forEach((value, index) => {
				element.write(view, index * element.layout.size, value);
			});

			values.forEach((value, index) => {
				expect(storage.get(index)).toBe(value);
			});
		},
	);

	it.each(SPECIALISED)(
		'should hold %s in a buffer of its own as it does in an allocator’s',
		(_name, type, sources) => {
			const element = type as unknown as AnyElement;
			const values: unknown[] = sources.map((source) => element.from(source as never));
			const storage = createFixedBufferStorage(element, values.length);

			expect(storage.get(values.length - 1)).toBe(
				element.read(new DataView(new ArrayBuffer(8)), 0),
			);

			values.forEach((value, index) => {
				storage.set(index, value);
			});

			values.forEach((value, index) => {
				expect(storage.get(index)).toBe(value);
			});
		},
	);

	it('should refuse an index outside it as it would without one', () => {
		const { storages } = pairOf(SignedInteger(32), 2);
		const [specialised, fallback] = storages;

		expect(refusalOf(() => specialised.get(2))).toEqual(refusalOf(() => fallback.get(2)));

		expect(
			refusalOf(() => {
				specialised.set(-1, 0);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(-1, 0);
			}),
		);
	});

	it('should refuse a value of another type as it would without one, before writing', () => {
		const { storages, buffers } = pairOf(SignedInteger(8), 2);
		const [specialised, fallback] = storages;

		expect(
			refusalOf(() => {
				specialised.set(0, 128);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(0, 128);
			}),
		);

		expect(
			refusalOf(() => {
				specialised.set(1, 1n);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(1, 1n);
			}),
		);

		expect([...new Uint8Array(buffers[0])]).toEqual([0, 0]);
	});

	it('should refuse every access once its memory was released, as it would without one', () => {
		const { storages, allocators } = pairOf(UnsignedInteger(16), 2);
		const [specialised, fallback] = storages;

		for (const allocator of allocators) allocator.reset();

		expect(refusalOf(() => specialised.get(0))).toEqual(refusalOf(() => fallback.get(0)));

		expect(
			refusalOf(() => {
				specialised.set(0, 1);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(0, 1);
			}),
		);
	});

	it('should refuse every access once its buffer shrank, as it would without one', () => {
		const { storages, buffers } = pairOf(DoublePrecisionFloat, 2, { maxByteLength: 16 });
		const [specialised, fallback] = storages;

		for (const buffer of buffers) buffer.resize(8);

		expect(refusalOf(() => specialised.get(0))).toEqual(refusalOf(() => fallback.get(0)));

		expect(
			refusalOf(() => {
				specialised.set(0, 1);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(0, 1);
			}),
		);

		for (const buffer of buffers) buffer.resize(16);

		specialised.set(1, 2.5);

		expect(specialised.get(1)).toBe(2.5);
	});

	it('should refuse every access once its buffer was detached, as it would without one', () => {
		const { storages, buffers } = pairOf(SignedInteger(64), 2);
		const [specialised, fallback] = storages;

		for (const buffer of buffers) buffer.transfer();

		expect(refusalOf(() => specialised.get(1))).toEqual(refusalOf(() => fallback.get(1)));

		expect(
			refusalOf(() => {
				specialised.set(1, 1n);
			}),
		).toEqual(
			refusalOf(() => {
				fallback.set(1, 1n);
			}),
		);
	});

	it('should hold its values through the element when an allocator hands out bytes the typed array cannot start on', () => {
		// Ignores the alignment it is asked for, as an allocator written outside
		// the package may.
		const buffer = new ArrayBuffer(16);

		const misaligned: Allocator = {
			allocate: (size: number): Allocation => {
				return { bytes: new DataView(buffer, 2, size), isLive: (): boolean => true };
			},
		};

		const Int32 = SignedInteger(32);
		const numbers: Storage<SignedInteger<32>> = allocate(Int32, 3, misaligned);

		numbers.set(2, Int32.minimum);

		expect(numbers.get(2)).toBe(Int32.minimum);
		expect(new DataView(buffer).getInt32(10, true)).toBe(Int32.minimum);
	});

	it('should hold its values through the element when its size carries padding', () => {
		const Int32 = SignedInteger(32);

		const padded: AlignedElement<SignedInteger<32>> = {
			...withoutEncoding(Int32),
			layout: { size: 8, alignment: 4, encoding: 'Int32' },
		};

		const buffer = new ArrayBuffer(24);
		const numbers = allocate(padded, 3, createFixedBufferAllocator(buffer));

		numbers.set(1, Int32.from(-7));

		expect(numbers.get(1)).toBe(-7);
		expect(new DataView(buffer).getInt32(8, true)).toBe(-7);
	});
});
