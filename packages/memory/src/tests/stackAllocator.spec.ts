import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation, AllocationDomain } from '@/allocator';
import { createStackAllocator, type StackAllocator } from '@/stackAllocator';

import { coded } from './coded';

/**
 * Behaviour suite for `createStackAllocator`.
 *
 * What the contract suite cannot say: frames nest, leaving one releases what
 * it allocated and nothing below it, frames are used and left last in first
 * out, and the buffer never grows.
 */

describe('createStackAllocator', () => {
	it('should release what a frame allocated when its scope ends, and put the stack back', () => {
		const stack: StackAllocator = createStackAllocator(256);
		let inside: Allocation | undefined;

		{
			using frame = stack.enter();

			inside = frame.allocate(64, 8);
		}

		const after: Allocation = stack.allocate(8, 8);

		expect(inside.isLive()).toBe(false);
		expect(after.bytes.byteOffset).toBe(inside.bytes.byteOffset);
	});

	it('should leave what is below a frame live when the frame is left', () => {
		const stack: StackAllocator = createStackAllocator(256);
		const below: Allocation = stack.allocate(8, 8);
		let outer: Allocation | undefined;
		let inner: Allocation | undefined;

		{
			using outerFrame = stack.enter();

			outer = outerFrame.allocate(8, 8);

			{
				using innerFrame = stack.enter();

				inner = innerFrame.allocate(8, 8);
			}

			expect(inner.isLive()).toBe(false);
			expect(outer.isLive()).toBe(true);
		}

		expect(outer.isLive()).toBe(false);
		expect(below.isLive()).toBe(true);
	});

	it('should release a frame when its scope ends by a throw', () => {
		const stack: StackAllocator = createStackAllocator(64);
		let inside: Allocation | undefined;

		expect(() => {
			using frame = stack.enter();

			inside = frame.allocate(64, 8);

			throw new Error('leaving early');
		}).toThrowError('leaving early');
		expect(inside?.isLive()).toBe(false);
		expect(stack.allocate(64, 8).isLive()).toBe(true);
	});

	it('should hand out zeroed bytes where a left frame wrote', () => {
		const stack: StackAllocator = createStackAllocator(64);

		{
			using frame = stack.enter();

			frame.allocate(8, 8).bytes.setFloat64(0, 42);
		}

		expect(stack.allocate(8, 8).bytes.getFloat64(0)).toBe(0);
	});

	it('should refuse a frame below the innermost one, from allocating or being left', () => {
		const stack: StackAllocator = createStackAllocator(256);
		const outer: AllocationDomain = stack.enter();
		const inner: AllocationDomain = stack.enter();

		expect(() => outer.allocate(8, 8)).toThrowError(
			coded(
				new Error(
					'FULCRO7008: StackAllocator.enter().allocate: frame 1 is not the innermost open frame, 2; frames are allocated from and left in last-in, first-out order.',
				),
				{
					operation: 'StackAllocator.enter().allocate',
					depth: 1,
					innermost: 2,
				},
			),
		);
		expect(() => outer[Symbol.dispose]()).toThrowError(
			coded(
				new Error(
					'FULCRO7008: StackAllocator.enter()[Symbol.dispose]: frame 1 is not the innermost open frame, 2; frames are allocated from and left in last-in, first-out order.',
				),
				{
					operation: 'StackAllocator.enter()[Symbol.dispose]',
					depth: 1,
					innermost: 2,
				},
			),
		);
		expect(() => stack.allocate(8, 8)).toThrowError(
			coded(
				new Error(
					'FULCRO7008: StackAllocator.allocate: frame 0 is not the innermost open frame, 2; frames are allocated from and left in last-in, first-out order.',
				),
				{ operation: 'StackAllocator.allocate', depth: 0, innermost: 2 },
			),
		);

		inner[Symbol.dispose]();

		expect(outer.allocate(8, 8).isLive()).toBe(true);
	});

	it('should refuse to allocate from a frame already left', () => {
		const stack: StackAllocator = createStackAllocator(64);
		const frame: AllocationDomain = stack.enter();

		frame[Symbol.dispose]();

		expect(() => frame.allocate(8, 8)).toThrowError(
			coded(
				new Error(
					'FULCRO7012: StackAllocator.enter().allocate: frame 1 was already left; enter a new one.',
				),
				{ operation: 'StackAllocator.enter().allocate', depth: 1 },
			),
		);
	});

	it('should treat leaving a frame twice as leaving it once', () => {
		const stack: StackAllocator = createStackAllocator(64);
		const below: AllocationDomain = stack.enter();
		const frame: AllocationDomain = stack.enter();

		frame[Symbol.dispose]();
		frame[Symbol.dispose]();

		expect(below.allocate(8, 8).isLive()).toBe(true);
	});

	it('should refuse a request it has no room for, leaving the stack as it was', () => {
		const stack: StackAllocator = createStackAllocator(32);

		stack.allocate(3, 1);

		expect(() => stack.allocate(29, 4)).toThrowError(
			coded(
				new RangeError(
					'FULCRO7007: StackAllocator.allocate: 29 bytes aligned to 4 were requested, but only 29 of 32 bytes remain.',
				),
				{
					operation: 'StackAllocator.allocate',
					requested: 29,
					alignment: 4,
					available: 29,
					capacity: 32,
				},
			),
		);
		expect(stack.allocate(29, 1).bytes.byteOffset).toBe(3);
	});

	it('should hand out the whole buffer, and nothing past it', () => {
		const stack: StackAllocator = createStackAllocator(16);

		expect(stack.allocate(16, 16).bytes.byteLength).toBe(16);
		expect(() => stack.allocate(1, 1)).toThrowError(RangeError);
	});

	it.each([
		[-1, '-1'],
		[1.5, '1.5'],
	])('should refuse a capacity of %s', (capacity, shown) => {
		expect(() => createStackAllocator(capacity)).toThrowError(
			coded(
				new RangeError(
					`FULCRO7005: createStackAllocator: expected a size in bytes that is a non-negative safe integer, received ${shown}.`,
				),
				{ operation: 'createStackAllocator', received: capacity },
			),
		);
	});

	it('should hand out frames that are allocation domains', () => {
		expectTypeOf(
			createStackAllocator(64).enter(),
		).toEqualTypeOf<AllocationDomain>();
		expect(Object.isFrozen(createStackAllocator(64).enter())).toBe(true);
	});
});
