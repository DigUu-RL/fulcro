import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IntegerType } from '@/src/integer';
import { countingView } from '@/src/tests/countingView';
import { UnsignedInteger } from '@/src/unsignedInteger';

/**
 * Performance suite for `UnsignedInteger`.
 *
 * The same structural promise as the signed type, counted the same way: the
 * widths a `number` carries never pass through a `bigint`, and the descriptor
 * is built once per width.
 */

/** How many operations each counted loop performs. */
const OPERATIONS = 100_000;

/** Conversions to `bigint` observed since the test started. */
let conversions = 0;

/** The real global, restored after each test. */
const nativeBigInt: BigIntConstructor = globalThis.BigInt;

beforeEach(() => {
	conversions = 0;

	globalThis.BigInt = new Proxy(nativeBigInt, {
		apply: (target, receiver, argumentsList): unknown => {
			conversions++;

			return Reflect.apply(target, receiver, argumentsList);
		},
	});
});

afterEach(() => {
	globalThis.BigInt = nativeBigInt;
});

describe.each([8, 16, 32] as const)('UnsignedInteger<%i>, carried by a number', (width) => {
	it('should never convert to a bigint, however many operations run', () => {
		const type = UnsignedInteger(width);
		const [first, second, third] = [type.from(3), type.from(5), type.from(7)] as const;

		// Each operand next to the one after it, wrapping around: the pairs are
		// iterated rather than indexed, so the loop carries no existence check.
		const pairs = [
			[first, second],
			[second, third],
			[third, first],
		] as const;

		conversions = 0;

		for (let index = 0; index < OPERATIONS;) {
			for (const [left, right] of pairs) {
				if (index === OPERATIONS) break;

				type.add(left, right);
				type.multiply(left, right);
				type.divide(left, right);
				type.remainder(left, right);
				type.wrap(-index * 1_000_003);
				type.from(index % 100);
				type.is(left);
				index++;
			}
		}

		expect(conversions).toBe(0);
	});
});

describe('the descriptor', () => {
	it('should be built once per width, not once per call', () => {
		UnsignedInteger(128);
		conversions = 0;

		for (let index = 0; index < OPERATIONS; index++) UnsignedInteger(128);

		expect(conversions).toBe(0);
	});
});

describe('bytes', () => {
	it.each([
		[8, 1],
		[16, 1],
		[32, 1],
		[64, 1],
		[128, 2],
	] as const)(
		'should touch the bytes of UnsignedInteger<%i> %i time(s) per value read or written',
		(width, accessesPerValue) => {
			const type = UnsignedInteger(width) as IntegerType<number | bigint>;
			const size: number = width / 8;
			const value = type.maximum;
			const { view, accesses } = countingView(size * OPERATIONS);

			for (let index = 0; index < OPERATIONS; index++) type.write(view, index * size, value);
			for (let index = 0; index < OPERATIONS; index++) type.read(view, index * size);

			expect(accesses()).toBe(2 * accessesPerValue * OPERATIONS);
		},
	);

	it.each([8, 16, 32] as const)(
		'should store UnsignedInteger<%i> without converting to a bigint',
		(width) => {
			const type = UnsignedInteger(width);
			const view = new DataView(new ArrayBuffer((width / 8) * OPERATIONS));

			conversions = 0;

			for (let index = 0; index < OPERATIONS; index++) {
				type.write(view, index * type.layout.size, type.maximum);
				type.read(view, index * type.layout.size);
			}

			expect(conversions).toBe(0);
		},
	);
});
