import { describe, expect, it } from 'vitest';

import { as } from '@/src/functions/utils/as';

/**
 * Behaviour suite for `as`.
 *
 * `is` is tested beside this one for whether the check is right. What is tested
 * here is what `as` adds on top: that a passing value comes back untouched, and
 * that a failing one produces a message worth reading.
 *
 * That second half is most of the suite, and deliberately. The language's own
 * `as` asserts without checking; if the replacement only managed "not an
 * DockingRecord", it would trade a silent lie for a useless complaint. Each case below
 * breaks the record in exactly one place and the error has to name that place.
 */

/** A record with one of everything worth checking. */
interface DockingRecord {
	readonly id: number;
	readonly note?: string;
	readonly tags: string[];
	readonly captain: { readonly callSign: string };
	readonly status: 'docked' | 'departed';
	readonly arrivedAt: Date;
}

/** A value satisfying every clause, for the cases below to spoil. */
const valid = (): Record<string, unknown> => {
	return {
		id: 1,
		tags: ['a'],
		captain: { callSign: 'Red Five' },
		status: 'docked',
		arrivedAt: new Date(),
	};
};

describe('what it lets through', () => {
	it('should hand back the value itself, not a copy', () => {
		// Nothing is rebuilt on the way through, so identity survives and a large
		// payload is not duplicated to be checked.
		const payload: unknown = valid();
		const order = as<DockingRecord>(payload);

		expect(order).toBe(payload);
		expect(order.captain.callSign).toBe('Red Five');
	});

	it('should narrow the value it returns', () => {
		const order = as<DockingRecord>(valid());

		// Would not compile if the type argument were not honoured.
		expect(order.tags).toHaveLength(1);
	});
});

describe('what it refuses, and what it says', () => {
	it('should throw a TypeError naming the type', () => {
		expect(() => as<DockingRecord>({ ...valid(), id: 'wrong' })).toThrow(TypeError);
		expect(() => as<DockingRecord>({ ...valid(), id: 'wrong' })).toThrow(/as<DockingRecord>\(\)/);
	});

	it.each([
		[
			'a top level property',
			(): { id: string } => ({ ...valid(), id: 'x' }),
			/id: expected number, got string/,
		],
		[
			'a nested property',
			(): { captain: { callSign: number } } => ({ ...valid(), captain: { callSign: 7 } }),
			/captain\.callSign: expected string, got number/,
		],
		[
			'an element of an array',
			(): { tags: (string | number)[] } => ({ ...valid(), tags: ['a', 'b', 4] }),
			/tags\[2\]: expected string, got number/,
		],
		[
			'a missing property',
			(): Record<string, unknown> => {
				const value = valid();
				delete value.id;
				return value;
			},
			/id: expected number, got undefined/,
		],
	])('should say where it stopped matching: %s', (_label, build, expected) => {
		// The whole reason a second walker is emitted. Told only "not a DockingRecord"
		// about a record with six fields, you are no better off than before.
		expect(() => as<DockingRecord>(build())).toThrow(expected);
	});

	it('should describe the value itself when the root is wrong', () => {
		expect(() => as<DockingRecord>('a string')).toThrow(/expected DockingRecord, got string/);
	});

	it('should not leave a stray colon when the failure is at the root', () => {
		// The path is empty there, and prefixing it would read `(): : expected`.
		expect(() => as<DockingRecord>(42)).not.toThrow(/: : expected/);
	});

	it('should point at the first failure, not every one', () => {
		// Two fields wrong, one message. Listing all of them would bury the one
		// that is usually the cause.
		const broken = { ...valid(), id: 'x', tags: 7 };

		expect(() => as<DockingRecord>(broken)).toThrow(/id: expected number/);
	});
});

describe('the escape hatch', () => {
	it('should accept a test written by hand, and use its name', () => {
		expect(() => {
			return as<{ id: number }>('wrong', {
				name: 'Identified',
				matches: () => false,
			});
		}).toThrow(/as<Identified>\(\)/);
	});

	it('should fall back to describing the value with no explainer', () => {
		// A hand written test carries no walker, so there is no path to name —
		// the message says what arrived instead of inventing where.
		expect(() => as<{ id: number }>(42, { name: 'Identified', matches: () => false })).toThrow(
			/refused a value of type number/,
		);
	});

	it('should refuse a call nothing resolved', () => {
		expect(() => (as as (value: unknown) => unknown)({})).toThrow(
			/was not resolved at compile time/,
		);
	});
});
