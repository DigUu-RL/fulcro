import { describe, expect, expectTypeOf, it } from 'vitest';

import type { Allocation, AllocationDomain, Allocator } from '@/src/allocator';
import { createManagedAllocator, type ManagedAllocator } from '@/src/managedAllocator';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for `createManagedAllocator`.
 *
 * What the contract suite cannot say: every allocation from the allocator is
 * a buffer of its own, and none of them is ever released — the garbage
 * collector reclaims an allocation only once nothing holds it, so one still
 * held is always live. Its frames release what they allocated when their scope
 * ends, reuse it in the frames after, and never refuse for room or order.
 */

describe('createManagedAllocator', () => {
	it('should give every allocation a buffer of its own, starting at zero', () => {
		const allocator: Allocator = createManagedAllocator();
		const first: Allocation = allocator.allocate(16, 8);
		const second: Allocation = allocator.allocate(16, 8);

		expect(first.bytes.buffer).not.toBe(second.bytes.buffer);
		expect(first.bytes.byteOffset).toBe(0);
		expect(first.bytes.buffer.byteLength).toBe(16);
	});

	it('should keep every allocation live, however many follow it', () => {
		const allocator: Allocator = createManagedAllocator();
		const first: Allocation = allocator.allocate(8, 8);

		for (let count = 0; count < 1_000; count++) allocator.allocate(8, 8);

		expect(first.isLive()).toBe(true);
	});

	it('should keep what the allocator allocated live while frames come and go', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const kept: Allocation = allocator.allocate(8, 8);

		{
			using frame = allocator.enter();

			frame.allocate(8, 8);
		}

		expect(kept.isLive()).toBe(true);
	});

	it('should release what a frame allocated when its scope ends', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		let inside: Allocation | undefined;

		{
			using frame = allocator.enter();

			inside = frame.allocate(64, 8);

			expect(inside.isLive()).toBe(true);
		}

		expect(inside.isLive()).toBe(false);
	});

	it('should release a frame when its scope ends by a throw', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		let inside: Allocation | undefined;

		expect(() => {
			using frame = allocator.enter();

			inside = frame.allocate(64, 8);

			throw new Error('leaving early');
		}).toThrow('leaving early');

		expect(inside?.isLive()).toBe(false);
	});

	it('should reuse the bytes of a left frame in the next one, zeroed', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		const step = (): DataView => {
			using frame = allocator.enter();

			const bytes: DataView = frame.allocate(16, 8).bytes;

			expect(bytes.getFloat64(0)).toBe(0);
			bytes.setFloat64(0, 42);

			return bytes;
		};

		step();

		const second: DataView = step();
		const third: DataView = step();

		expect(third.buffer).toBe(second.buffer);
		expect(third.byteOffset).toBe(second.byteOffset);
	});

	it('should place the allocations of a frame at the offsets their alignment asks for', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		const step = (): number[] => {
			using frame = allocator.enter();

			return [frame.allocate(3, 1), frame.allocate(8, 8), frame.allocate(2, 2)].map(
				(allocation) => allocation.bytes.byteOffset,
			);
		};

		step();

		expect(step()).toEqual([0, 8, 16]);
	});

	it('should leave what an outer frame allocated live when an inner one is left', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		let outer: Allocation | undefined;
		let inner: Allocation | undefined;

		{
			using outerFrame = allocator.enter();

			outer = outerFrame.allocate(8, 8);

			{
				using innerFrame = allocator.enter();

				inner = innerFrame.allocate(8, 8);
			}

			expect(inner.isLive()).toBe(false);
			expect(outer.isLive()).toBe(true);
		}

		expect(outer.isLive()).toBe(false);
	});

	it('should let an outer frame allocate while an inner one is open, without sharing bytes', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		// The first run sizes the reused region; the second runs inside it.
		for (let run = 0; run < 2; run++) {
			using outer = allocator.enter();
			using inner = allocator.enter();

			const fromInner: Allocation = inner.allocate(8, 8);
			const fromOuter: Allocation = outer.allocate(8, 8);

			fromInner.bytes.setFloat64(0, 1);
			fromOuter.bytes.setFloat64(0, 2);

			expect(fromInner.bytes.getFloat64(0)).toBe(1);
			expect(fromOuter.isLive()).toBe(true);
		}
	});

	it('should accept frames left in any order, and keep an early one released', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const outer: AllocationDomain = allocator.enter();
		const inner: AllocationDomain = allocator.enter();
		const fromOuter: Allocation = outer.allocate(8, 8);
		const fromInner: Allocation = inner.allocate(8, 8);

		expect(() => {
			outer[Symbol.dispose]();
		}).not.toThrow();

		expect(fromOuter.isLive()).toBe(false);
		expect(fromInner.isLive()).toBe(true);

		inner[Symbol.dispose]();

		expect(fromInner.isLive()).toBe(false);
	});

	it('should not hand out the bytes of a frame left early while one opened after it is open', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		{
			using frame = allocator.enter();

			frame.allocate(64, 8);
		}

		const early: AllocationDomain = allocator.enter();

		early.allocate(16, 8);

		const later: AllocationDomain = allocator.enter();
		const held: Allocation = later.allocate(16, 8);

		held.bytes.setFloat64(0, 42);
		early[Symbol.dispose]();

		const next: AllocationDomain = allocator.enter();

		next.allocate(16, 8).bytes.setFloat64(0, 7);

		expect(held.bytes.getFloat64(0)).toBe(42);
	});

	it('should hand out a request larger than any frame held before', () => {
		const allocator: ManagedAllocator = createManagedAllocator();

		{
			using frame = allocator.enter();

			frame.allocate(8, 8);
		}

		using frame = allocator.enter();

		expect(frame.allocate(1_024, 8).bytes.byteLength).toBe(1_024);
	});

	it('should refuse to allocate from a frame already left', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const frame: AllocationDomain = allocator.enter();

		frame[Symbol.dispose]();

		expect(() => frame.allocate(8, 8)).toThrow(
			coded(
				new Error(
					'FULCRO7012: ManagedAllocator.enter().allocate: frame 1 was already left; enter a new one.',
				),
				{ operation: 'ManagedAllocator.enter().allocate', depth: 1 },
			),
		);
	});

	it('should refuse an invalid request from a frame', () => {
		using frame = createManagedAllocator().enter();

		expect(() => frame.allocate(8, 3)).toThrow(RangeError);
	});

	it('should treat leaving a frame twice as leaving it once', () => {
		const allocator: ManagedAllocator = createManagedAllocator();
		const below: AllocationDomain = allocator.enter();
		const frame: AllocationDomain = allocator.enter();

		frame[Symbol.dispose]();
		frame[Symbol.dispose]();

		expect(below.allocate(8, 8).isLive()).toBe(true);
	});

	it('should be an allocator with frames, and nothing to release by hand', () => {
		expectTypeOf(createManagedAllocator()).toEqualTypeOf<ManagedAllocator>();
		expectTypeOf<ManagedAllocator>().toExtend<Allocator>();
		expectTypeOf(createManagedAllocator().enter()).toEqualTypeOf<AllocationDomain>();
		expect(Object.keys(createManagedAllocator())).toEqual(['allocate', 'enter']);
		expect(Object.isFrozen(createManagedAllocator().enter())).toBe(true);
	});
});
