import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation, Allocator } from '@/allocator';
import { createArenaAllocator } from '@/arenaAllocator';
import { createFixedBufferAllocator } from '@/fixedBufferAllocator';
import { createManagedAllocator } from '@/managedAllocator';
import { createPoolAllocator } from '@/poolAllocator';
import { createStackAllocator } from '@/stackAllocator';

import { coded } from './coded';

/**
 * Behaviour suite for the `Allocator` contract.
 *
 * The same cases over every strategy, and over a frame of the stack, which is
 * an allocator too: code written against `Allocator` must not be able to tell
 * which one it was handed. What only one strategy does — how its memory goes
 * back — is in that strategy's own suite.
 *
 * Every request here fits every strategy: at most 64 bytes, aligned to at
 * most 16, which a pool of 64-byte blocks accepts.
 */

/** Each strategy: its name, the operation its errors name, and a factory. */
const STRATEGIES = [
	['ManagedAllocator', 'ManagedAllocator.allocate', createManagedAllocator],
	[
		'ArenaAllocator',
		'ArenaAllocator.allocate',
		(): Allocator => createArenaAllocator(256),
	],
	[
		'StackAllocator',
		'StackAllocator.allocate',
		(): Allocator => createStackAllocator(4096),
	],
	[
		'a frame of StackAllocator',
		'StackAllocator.enter().allocate',
		(): Allocator => createStackAllocator(4096).enter(),
	],
	[
		'FixedBufferAllocator',
		'FixedBufferAllocator.allocate',
		(): Allocator => createFixedBufferAllocator(new ArrayBuffer(4096)),
	],
	[
		'PoolAllocator',
		'PoolAllocator.allocate',
		(): Allocator => createPoolAllocator(64, 32),
	],
] as const;

/**
 * Reads every byte of an allocation.
 *
 * @param allocation Allocation to read.
 * @returns Its bytes, in order.
 */
const bytesOf = (allocation: Allocation): number[] =>
	Array.from(
		new Uint8Array(
			allocation.bytes.buffer,
			allocation.bytes.byteOffset,
			allocation.bytes.byteLength,
		),
	);

/**
 * A consumer that knows nothing but the contract.
 *
 * @param allocator Any allocator.
 * @param values Numbers to store.
 * @returns The numbers, read back from the memory they were stored in.
 */
const roundTrip = (allocator: Allocator, values: number[]): number[] => {
	const { bytes } = allocator.allocate(values.length * 8, 8);

	values.forEach((value, index) => bytes.setFloat64(index * 8, value));

	return values.map((_, index) => bytes.getFloat64(index * 8));
};

describe.each(STRATEGIES)('%s, as an Allocator', (_name, operation, create) => {
	it('should hand out exactly the bytes asked for, zeroed', () => {
		const allocation: Allocation = create().allocate(24, 8);

		expect(allocation.bytes.byteLength).toBe(24);
		expect(bytesOf(allocation).every((byte) => byte === 0)).toBe(true);
	});

	it.each([1, 2, 4, 8, 16])(
		'should start an allocation aligned to %s, after an odd-sized one',
		(alignment) => {
			const allocator: Allocator = create();

			allocator.allocate(3, 1);

			const { bytes } = allocator.allocate(8, alignment);

			expect(bytes.byteOffset % alignment).toBe(0);
		},
	);

	it('should never hand out the same byte twice while both are live', () => {
		const allocator: Allocator = create();
		const first: Allocation = allocator.allocate(32, 4);
		const second: Allocation = allocator.allocate(32, 4);

		new Uint8Array(
			first.bytes.buffer,
			first.bytes.byteOffset,
			first.bytes.byteLength,
		).fill(0xff);

		expect(bytesOf(second).every((byte) => byte === 0)).toBe(true);
	});

	it('should report an allocation as live once it is made', () => {
		expect(create().allocate(8, 8).isLive()).toBe(true);
	});

	it('should accept a request of zero bytes', () => {
		expect(create().allocate(0, 1).bytes.byteLength).toBe(0);
	});

	it('should run a consumer written against the contract', () => {
		expect(roundTrip(create(), [1.5, -2, 1e300])).toEqual([1.5, -2, 1e300]);
	});

	it('should be frozen, and so should its allocations', () => {
		const allocator: Allocator = create();

		expect(Object.isFrozen(allocator)).toBe(true);
		expect(Object.isFrozen(allocator.allocate(8, 8))).toBe(true);
	});

	it('should work with its methods taken off the object', () => {
		const { allocate } = create();
		const { isLive } = allocate(8, 8);

		expect(isLive()).toBe(true);
	});

	it.each([
		[-1, '-1'],
		[1.5, '1.5'],
		[Number.NaN, 'NaN'],
		[2 ** 53, String(2 ** 53)],
	])('should refuse a size of %s', (size, shown) => {
		expect(() => create().allocate(size, 1)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7005: ${operation}: expected a size in bytes that is a non-negative safe integer, received ${shown}.`,
				),
				{ operation, received: size },
			),
		);
	});

	it.each([
		[0, '0'],
		[3, '3'],
		[-2, '-2'],
		[1.5, '1.5'],
		[Number.NaN, 'NaN'],
	])('should refuse an alignment of %s', (alignment, shown) => {
		expect(() => create().allocate(8, alignment)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7006: ${operation}: expected an alignment that is a positive power of two, received ${shown}.`,
				),
				{ operation, received: alignment },
			),
		);
	});

	it('should describe a request that is not a number', () => {
		expect(() => create().allocate('8' as unknown as number, 1)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7005: ${operation}: expected a size in bytes that is a non-negative safe integer, received string.`,
				),
				{ operation, received: 'string' },
			),
		);
	});

	it('should satisfy the contract by type', () => {
		expectTypeOf(create()).toMatchTypeOf<Allocator>();
		expectTypeOf(create().allocate(8, 8)).toEqualTypeOf<Allocation>();
	});
});
