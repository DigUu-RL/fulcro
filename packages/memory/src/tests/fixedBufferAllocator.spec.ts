import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation } from '@/allocator';
import {
	createFixedBufferAllocator,
	type FixedBufferAllocator,
} from '@/fixedBufferAllocator';

import { coded } from './coded';

/**
 * Behaviour suite for `createFixedBufferAllocator`.
 *
 * What the contract suite cannot say: every allocation comes out of the
 * buffer the caller supplied, a request past its end is refused, and `reset`
 * releases everything and starts again from the front.
 */

describe('createFixedBufferAllocator', () => {
	it('should hand out the caller’s buffer, front to back', () => {
		const memory = new ArrayBuffer(64);
		const allocator: FixedBufferAllocator = createFixedBufferAllocator(memory);
		const first: Allocation = allocator.allocate(8, 8);
		const second: Allocation = allocator.allocate(8, 8);

		expect(first.bytes.buffer).toBe(memory);
		expect([first.bytes.byteOffset, second.bytes.byteOffset]).toEqual([0, 8]);
	});

	it('should zero what the buffer held before, as it hands it out', () => {
		const memory = new ArrayBuffer(8);

		new Uint8Array(memory).fill(0xff);

		const allocator: FixedBufferAllocator = createFixedBufferAllocator(memory);

		expect(allocator.allocate(8, 8).bytes.getFloat64(0)).toBe(0);
	});

	it('should refuse a request past the end of the buffer', () => {
		const allocator: FixedBufferAllocator = createFixedBufferAllocator(
			new ArrayBuffer(16),
		);

		allocator.allocate(12, 4);

		expect(() => allocator.allocate(8, 1)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7007: FixedBufferAllocator.allocate: 8 bytes aligned to 1 were requested, but only 4 of 16 bytes remain.',
				),
				{
					operation: 'FixedBufferAllocator.allocate',
					requested: 8,
					alignment: 1,
					available: 4,
					capacity: 16,
				},
			),
		);
	});

	it('should count the alignment padding against the room left', () => {
		const allocator: FixedBufferAllocator = createFixedBufferAllocator(
			new ArrayBuffer(16),
		);

		allocator.allocate(1, 1);

		expect(() => allocator.allocate(12, 8)).toThrowError(RangeError);
		expect(allocator.allocate(8, 8).bytes.byteOffset).toBe(8);
	});

	it('should release everything on reset and start again from the front', () => {
		const allocator: FixedBufferAllocator = createFixedBufferAllocator(
			new ArrayBuffer(16),
		);
		const before: Allocation = allocator.allocate(16, 8);

		allocator.reset();

		const after: Allocation = allocator.allocate(16, 8);

		expect(before.isLive()).toBe(false);
		expect(after.isLive()).toBe(true);
		expect(after.bytes.byteOffset).toBe(0);
	});

	it.each([
		['undefined', undefined],
		['null', null],
		['number', 16],
		['SharedArrayBuffer', new SharedArrayBuffer(16)],
		['Uint8Array', new Uint8Array(16)],
	])('should refuse %s where a buffer is expected', (received, buffer) => {
		expect(() =>
			createFixedBufferAllocator(buffer as unknown as ArrayBuffer),
		).toThrowError(
			coded(
				new TypeError(
					`FULCRO7013: createFixedBufferAllocator: expected an ArrayBuffer, received ${received}.`,
				),
				{ operation: 'createFixedBufferAllocator', received },
			),
		);
	});

	it('should be an allocator with a reset, and not a domain', () => {
		expectTypeOf(
			createFixedBufferAllocator(new ArrayBuffer(8)),
		).toEqualTypeOf<FixedBufferAllocator>();
		expectTypeOf<FixedBufferAllocator>().not.toMatchTypeOf<Disposable>();
	});
});
