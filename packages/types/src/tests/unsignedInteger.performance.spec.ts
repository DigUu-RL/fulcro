import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { UnsignedInteger } from '@/unsignedInteger';

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
		apply: (target, receiver, argumentsList) => {
			conversions++;

			return Reflect.apply(target, receiver, argumentsList);
		},
	});
});

afterEach(() => {
	globalThis.BigInt = nativeBigInt;
});

describe.each([8, 16, 32] as const)(
	'UnsignedInteger<%i>, carried by a number',
	(width) => {
		it('should never convert to a bigint, however many operations run', () => {
			const type = UnsignedInteger(width);
			const values = [type.from(3), type.from(5), type.from(7)] as const;

			conversions = 0;

			for (let index = 0; index < OPERATIONS; index++) {
				const left = values[index % 3];
				const right = values[(index + 1) % 3];

				type.add(left, right);
				type.multiply(left, right);
				type.divide(left, right);
				type.remainder(left, right);
				type.wrap(-index * 1_000_003);
				type.from(index % 100);
				type.is(left);
			}

			expect(conversions).toBe(0);
		});
	},
);

describe('the descriptor', () => {
	it('should be built once per width, not once per call', () => {
		UnsignedInteger(128);
		conversions = 0;

		for (let index = 0; index < OPERATIONS; index++) UnsignedInteger(128);

		expect(conversions).toBe(0);
	});
});
