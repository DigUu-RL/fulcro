import { describe, expect, it } from 'vitest';

import { is } from '@/functions/utils/is';

/**
 * Behaviour suite for `is`.
 *
 * It runs **with** the transformer applied, since the harness wires it in, so
 * it exercises the path a consumer who set it up actually gets rather than a
 * simulation of it.
 *
 * The weight is on refusal. A check that says yes too readily passes every
 * acceptance test while being worthless — it is false confidence exactly where
 * the data is least trustworthy — so each clause of the record below is spoiled
 * on its own and has to be the one that fails.
 */

/** A record with one of everything worth checking. */
interface Order {
	readonly id: number;
	readonly note?: string;
	readonly tags: string[];
	readonly customer: { readonly email: string };
	readonly status: 'pending' | 'paid';
	readonly placedAt: Date;
}

/** A value satisfying every clause, for the cases below to spoil. */
const valid = (): Record<string, unknown> => ({
	id: 1,
	tags: ['a'],
	customer: { email: 'a@b.c' },
	status: 'pending',
	placedAt: new Date(),
});

describe('what it accepts', () => {
	it('should accept a value that satisfies every clause', () => {
		expect(is<Order>(valid())).toBe(true);
	});

	it('should narrow the value it accepts', () => {
		const payload: unknown = valid();

		if (is<Order>(payload)) {
			// Would not compile if the guard were lost: `payload` is `unknown`
			// outside this branch.
			expect(typeof payload.customer.email).toBe('string');
			return;
		}

		throw new Error('The guard rejected a valid value.');
	});

	it('should accept an optional property being absent', () => {
		expect(is<Order>({ ...valid(), note: undefined })).toBe(true);
		expect(is<Order>({ ...valid(), note: 'a note' })).toBe(true);
	});

	it('should accept extra properties, as structural typing does', () => {
		// Rejecting them would make this disagree with the compiler that produced
		// the check: an object carrying more than `Order` requires is an `Order`.
		expect(is<Order>({ ...valid(), extra: 42 })).toBe(true);
	});
});

describe('what it refuses', () => {
	it.each([
		['a missing required property', () => ({ ...valid(), id: undefined })],
		['a property of the wrong type', () => ({ ...valid(), id: '1' })],
		['an optional property of the wrong type', () => ({ ...valid(), note: 7 })],
		['an array that is not one', () => ({ ...valid(), tags: 'a' })],
		['an array with a wrong element', () => ({ ...valid(), tags: ['a', 2] })],
		['a nested object missing its field', () => ({ ...valid(), customer: {} })],
		['a value outside the union', () => ({ ...valid(), status: 'shipped' })],
		[
			'a class field that is not an instance',
			() => ({ ...valid(), placedAt: '2020-01-01' }),
		],
		['null', () => null],
		['a primitive', () => 'an order'],
	])('should reject %s', (_label, build) => {
		expect(is<Order>(build())).toBe(false);
	});

	it('should not throw while rejecting null', () => {
		// `typeof null` is `'object'`, so a check testing the type before ruling
		// out null would read a property of null and crash rather than answering.
		expect(() => is<Order>(null)).not.toThrow();
	});
});

describe('the escape hatch', () => {
	it('should accept a test written by hand', () => {
		const payload: unknown = { id: 1 };

		expect(
			is<{ id: number }>(payload, {
				name: 'Identified',
				matches: (value) =>
					value !== null &&
					typeof value === 'object' &&
					typeof (value as { id: unknown }).id === 'number',
			}),
		).toBe(true);
	});

	it('should refuse a call nothing resolved', () => {
		// What arrives when the plugin did not run, or when the type had no
		// runtime form. From inside the running program those are
		// indistinguishable, so the message names both.
		expect(() => (is as (value: unknown) => boolean)({})).toThrow(
			/was not resolved at compile time/,
		);
	});
});
