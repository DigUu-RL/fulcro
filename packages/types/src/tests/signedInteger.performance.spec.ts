import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SignedInteger } from '@/signedInteger';

/**
 * Performance suite for `SignedInteger`.
 *
 * The cost this type promises is a structural one: the widths a `number` can
 * carry never go through a `bigint`. A conversion to `bigint` on the way in or
 * out of every addition would give the right answers and cost an allocation
 * per operation — every behaviour test would pass over it. So the suite counts
 * the conversions, by standing a counting proxy in front of the global
 * `BigInt` for the length of each test.
 *
 * The wide widths do need `bigint`, and are held to a ratio against the native
 * operator instead: checked arithmetic costs a comparison more than `+`, not a
 * different complexity class.
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

/**
 * Times a loop.
 *
 * @param work Work to repeat.
 * @returns Milliseconds taken, never less than one.
 */
const timed = (work: (index: number) => void): number => {
	const started: number = performance.now();

	for (let index = 0; index < OPERATIONS; index++) work(index);

	return Math.max(performance.now() - started, 1);
};

describe.each([8, 16, 32] as const)(
	'SignedInteger<%i>, carried by a number',
	(width) => {
		it('should never convert to a bigint, however many operations run', () => {
			// Built before counting: the descriptor computes its range once, in
			// `bigint`, and that is not the cost being asserted on.
			const type = SignedInteger(width);
			const values = [type.from(3), type.from(-5), type.from(7)] as const;

			conversions = 0;

			for (let index = 0; index < OPERATIONS; index++) {
				const left = values[index % 3];
				const right = values[(index + 1) % 3];

				type.add(left, right);
				type.subtract(left, right);
				type.multiply(left, right);
				type.divide(left, right);
				type.remainder(left, right);
				type.wrap(index * 1_000_003);
				type.from(index % 100);
				type.is(left);
			}

			expect(conversions).toBe(0);
		});
	},
);

describe('SignedInteger<64>, carried by a bigint', () => {
	it('should convert only a number handed to it, once', () => {
		const type = SignedInteger(64);

		conversions = 0;
		type.from(5);
		type.from(5n);
		type.add(type.from(1n), type.from(2n));

		expect(conversions).toBe(1);
	});

	it('should cost a small multiple of the native operator', () => {
		const type = SignedInteger(64);
		const left = type.from(123_456_789n);
		const right = type.from(987_654_321n);

		let sink = 0n;

		const baseline: number = timed(() => {
			sink += (left as bigint) + (right as bigint);
		});
		const checked: number = timed(() => {
			sink += type.add(left, right);
		});

		expect(sink).toBeGreaterThan(0n);
		expect(checked).toBeLessThan(baseline * 25);
	});
});

describe('the descriptor', () => {
	it('should be built once per width, not once per call', () => {
		SignedInteger(16);
		conversions = 0;

		for (let index = 0; index < OPERATIONS; index++) SignedInteger(16);

		// Building one computes its range with `BigInt`; a cache miss per call
		// would show here as two conversions per call.
		expect(conversions).toBe(0);
	});
});
