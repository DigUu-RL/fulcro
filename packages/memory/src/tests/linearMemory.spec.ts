import { describe, expect, expectTypeOf, it } from 'vitest';

import { createLinearMemory, type LinearMemory } from '@/linearMemory';

import { coded } from './coded';
import { instantiateRecordingModule, webAssembly } from './recordingModule';

/**
 * Behaviour suite for `createLinearMemory`.
 *
 * A linear memory is the bytes it was made over, seen as one address space:
 * it copies nothing, follows its memory as it grows, exposes nothing but its
 * length, and refuses what it cannot address — a shared memory included.
 */

/** One WebAssembly page, in bytes. */
const PAGE = 65_536;

describe('createLinearMemory', () => {
	it('should span an ArrayBuffer, exposing its length and nothing else', () => {
		const memory: LinearMemory = createLinearMemory(new ArrayBuffer(64));

		expect(memory.byteLength).toBe(64);
		expect(Object.keys(memory)).toEqual(['byteLength']);
		expect(Object.isFrozen(memory)).toBe(true);
	});

	it('should span the memory a WebAssembly module exports, and follow it as it grows', () => {
		const module = instantiateRecordingModule();
		const memory: LinearMemory = createLinearMemory(module.memory);

		expect(memory.byteLength).toBe(PAGE);

		module.grow(2);

		expect(memory.byteLength).toBe(3 * PAGE);
	});

	it('should follow a memory grown from outside the module', () => {
		const backing = new webAssembly.Memory({ initial: 1, maximum: 4 });
		const memory: LinearMemory = createLinearMemory(backing);

		backing.grow(1);

		expect(memory.byteLength).toBe(2 * PAGE);
	});

	it('should follow a resizable ArrayBuffer as it resizes', () => {
		const buffer = new ArrayBuffer(16, { maxByteLength: 64 });
		const memory: LinearMemory = createLinearMemory(buffer);

		buffer.resize(48);

		expect(memory.byteLength).toBe(48);

		buffer.resize(8);

		expect(memory.byteLength).toBe(8);
	});

	it.each([
		['a SharedArrayBuffer', new SharedArrayBuffer(8), 'SharedArrayBuffer'],
		[
			'a shared WebAssembly memory',
			new webAssembly.Memory({ initial: 1, maximum: 1, shared: true }),
			'WebAssembly.Memory over a SharedArrayBuffer',
		],
		['a typed array', new Uint8Array(8), 'Uint8Array'],
		['an object without a buffer', {}, 'Object'],
		['a number', 16, 'number'],
		['null', null, 'null'],
	])('should refuse %s', (_, backing, received) => {
		expect(() =>
			createLinearMemory(backing as unknown as ArrayBuffer),
		).toThrowError(
			coded(
				new TypeError(
					`FULCRO7018: createLinearMemory: expected an ArrayBuffer or a WebAssembly.Memory that is not shared, received ${received}.`,
				),
				{ operation: 'createLinearMemory', received },
			),
		);
	});
});

describe('createLinearMemory types', () => {
	it('should accept a buffer or anything with one, and return a linear memory', () => {
		expectTypeOf(createLinearMemory)
			.parameter(0)
			.toEqualTypeOf<ArrayBuffer | { readonly buffer: ArrayBuffer }>();
		expectTypeOf(
			createLinearMemory(new ArrayBuffer(8)),
		).toEqualTypeOf<LinearMemory>();
	});
});
