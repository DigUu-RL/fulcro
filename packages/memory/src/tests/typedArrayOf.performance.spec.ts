import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	DoublePrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	UnsignedInteger,
} from '@fulcro/types';

import { allocate } from '@/src/allocate';
import type { AlignedElement } from '@/src/element';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import { createManagedAllocator } from '@/src/managedAllocator';
import type { Storage } from '@/src/storage';

/**
 * Performance suite for the storages `typedArrayOf` specialises.
 *
 * Counted, never timed (`docs/testing.md`). Every accessor of
 * `DataView.prototype` is replaced by one that counts its calls, which is
 * where every `read` and `write` of an element type ends up, and the element
 * type is wrapped so its own `read`, `write` and `is` are counted too. What is
 * asserted is the promise of the specialisation: a storage held in a typed
 * array reaches neither, however many values it holds, while the same element
 * type without its encoding costs one of each per access.
 *
 * What an access allocates is not asserted: JavaScript has no deterministic
 * way to count the objects a call makes, and a heap snapshot measures the
 * collector as much as the call. The counts above are what the claim rests on.
 */

/** The accessors of `DataView`, each counted while a case runs. */
const ACCESSORS = [
	'getInt8',
	'getUint8',
	'getInt16',
	'getUint16',
	'getInt32',
	'getUint32',
	'getBigInt64',
	'getBigUint64',
	'getFloat32',
	'getFloat64',
	'setInt8',
	'setUint8',
	'setInt16',
	'setUint16',
	'setInt32',
	'setUint32',
	'setBigInt64',
	'setBigUint64',
	'setFloat32',
	'setFloat64',
] as const;

/** Enough values for a per-element cost to separate from a constant one. */
const VOLUME = 100_000;

let accesses = 0;
let reads = 0;
let writes = 0;
let recognitions = 0;

/** The prototype's own accessors, as they were before any case replaced them. */
const originals = Object.getOwnPropertyDescriptors(DataView.prototype);

beforeEach(() => {
	accesses = 0;
	reads = 0;
	writes = 0;
	recognitions = 0;

	for (const accessor of ACCESSORS) {
		const original = originals[accessor].value as (...parameters: unknown[]) => unknown;

		Object.defineProperty(DataView.prototype, accessor, {
			...originals[accessor],
			value: function (this: DataView, ...parameters: unknown[]): unknown {
				accesses++;

				return original.apply(this, parameters);
			},
		});
	}
});

afterEach(() => {
	for (const accessor of ACCESSORS) {
		Object.defineProperty(DataView.prototype, accessor, originals[accessor]);
	}
});

/**
 * An element type counting what a storage asks of it.
 *
 * @param element Element type to wrap.
 * @param encoding Whether the wrapper keeps the element's encoding.
 * @returns The wrapper.
 */
const counted = <T>(element: AlignedElement<T>, encoding: boolean): AlignedElement<T> => {
	const { size, alignment } = element.layout;

	return {
		name: element.name,
		layout: encoding ? element.layout : { size, alignment },
		read: (view: DataView, offset: number): T => {
			reads++;

			return element.read(view, offset);
		},
		write: (view: DataView, offset: number, value: T): void => {
			writes++;
			element.write(view, offset, value);
		},
		is: (value: unknown): value is T => {
			recognitions++;

			return element.is(value);
		},
	};
};

/**
 * Sets every position to one value, then reads every one back.
 *
 * @param storage Storage to walk.
 * @param value Value to set.
 */
const walk = <T>(storage: Storage<T>, value: T): void => {
	for (let index = 0; index < storage.length; index++) storage.set(index, value);
	for (let index = 0; index < storage.length; index++) storage.get(index);
};

describe('a storage held in a typed array, counted', () => {
	it.each([
		['SignedInteger<8>', SignedInteger(8), -1],
		['UnsignedInteger<8>', UnsignedInteger(8), 1],
		['SignedInteger<16>', SignedInteger(16), -1],
		['UnsignedInteger<16>', UnsignedInteger(16), 1],
		['SignedInteger<32>', SignedInteger(32), -1],
		['UnsignedInteger<32>', UnsignedInteger(32), 1],
		['SignedInteger<64>', SignedInteger(64), -1n],
		['UnsignedInteger<64>', UnsignedInteger(64), 1n],
		['SinglePrecisionFloat', SinglePrecisionFloat, 0.5],
		['DoublePrecisionFloat', DoublePrecisionFloat, 0.1],
	] as const)(
		'should reach no accessor and no read or write of %s, and recognise once per set',
		(_name, type, source) => {
			const element = counted(type as unknown as AlignedElement<unknown>, true);
			const value: unknown = (type.from as (value: number | bigint) => unknown)(source);

			walk(allocate(element, VOLUME, createManagedAllocator()), value);
			walk(createFixedBufferStorage(element, VOLUME), value);

			expect([accesses, reads, writes, recognitions]).toEqual([0, 0, 0, 2 * VOLUME]);
		},
	);

	it('should cost one read or write of the element and one accessor per access without its encoding', () => {
		const Int32 = SignedInteger(32);
		const element = counted(Int32, false);
		const value: SignedInteger<32> = Int32.from(-1);

		walk(allocate(element, VOLUME, createManagedAllocator()), value);

		expect([accesses, reads, writes, recognitions]).toEqual([2 * VOLUME, VOLUME, VOLUME, VOLUME]);
	});

	it('should reach nothing when it is made, however long', () => {
		const element = counted(DoublePrecisionFloat, true);

		allocate(element, VOLUME, createManagedAllocator());
		createFixedBufferStorage(element, VOLUME);

		expect([accesses, reads, writes, recognitions]).toEqual([0, 0, 0, 0]);
	});

	it('should reach nothing for an index it refuses', () => {
		const element = counted(SinglePrecisionFloat, true);
		const floats = createFixedBufferStorage(element, VOLUME);

		expect(() => floats.get(VOLUME)).toThrow(RangeError);

		expect(() => {
			floats.set(-1, SinglePrecisionFloat.from(1));
		}).toThrow(RangeError);

		expect([accesses, reads, writes, recognitions]).toEqual([0, 0, 0, 0]);
	});
});
