import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { none, type Option, optionOf, some } from '@/option';

import { compileFixture, COMPILERS, reportedLines } from './compileFixture';

describe('some', () => {
	it('should carry the value', () => {
		const option: Option<string> = some('here');

		expect(option.value).toBe('here');
		expect(option.isSome()).toBe(true);
		expect(option.isNone()).toBe(false);
	});

	it.each([null, undefined])('should keep %s as a present value', (nullish) => {
		// `some` takes what it is given; reading nullish as absent is
		// `optionOf`'s job, not this one's.
		const option: Option<null | undefined> = some(nullish);

		expect(option.isSome()).toBe(true);
		expect(option.value).toBe(nullish);
	});

	it('should hand the value to the some branch', () => {
		expect(
			some('four').handle({
				some: (value) => value.length,
				none: () => 0,
			}),
		).toBe(4);
	});
});

describe('none', () => {
	it('should carry a null value', () => {
		const option: Option<string> = none();

		expect(option.value).toBeNull();
		expect(option.isSome()).toBe(false);
		expect(option.isNone()).toBe(true);
	});

	it('should run the none branch', () => {
		const option: Option<string> = none();

		expect(
			option.handle({
				some: (value) => value.length,
				none: () => -1,
			}),
		).toBe(-1);
	});
});

describe('optionOf', () => {
	it.each([null, undefined])('should read %s as absent', (nullish) => {
		expect(optionOf(nullish).isNone()).toBe(true);
	});

	it.each([0, '', false, Number.NaN])('should read %s as present', (falsy) => {
		// Only nullish is absent. Each of these is a value somebody meant.
		const option = optionOf(falsy);

		expect(option.isSome()).toBe(true);
		expect(option.value).toBe(falsy);
	});

	it('should keep an object by reference', () => {
		const user = { name: 'Ada' };

		expect(optionOf(user).value).toBe(user);
	});
});

describe('Option', () => {
	it('should run only the branch of its own variant', () => {
		const ran: string[] = [];
		const cases = {
			some: (): void => void ran.push('some'),
			none: (): void => void ran.push('none'),
		};

		some(1).handle(cases);
		none().handle(cases);

		expect(ran).toEqual(['some', 'none']);
	});

	it('should narrow on isSome', () => {
		const option: Option<number> = some(7);

		if (!option.isSome()) {
			expect.unreachable('the option is present');
			return;
		}

		// Reached only when the union narrowed: `value` is `number` here, not
		// `number | null`, and this assignment is what proves it.
		const value: number = option.value;

		expect(value).toBe(7);
	});

	it('should be frozen', () => {
		expect(Object.isFrozen(some(1))).toBe(true);
		expect(Object.isFrozen(none())).toBe(true);
	});

	it('should show its data and nothing else', () => {
		const keys: string[] = [];

		for (const key in some(1)) keys.push(key);

		expect(keys).toEqual(['value']);
		expect({ ...some(1) }).toEqual({ value: 1 });
		expect(none()).toEqual({ value: null });
	});

	it('should tell some(null) from none() by variant alone', () => {
		// Their data is identical; only the variant differs, which is why the
		// methods are the discriminant here and `value` is not.
		expect({ ...some(null) }).toEqual({ ...none() });
		expect(some(null).isSome()).toBe(true);
		expect(none().isSome()).toBe(false);
	});
});

/** Fixture fed to the compilers. */
const FIXTURE = 'option.fixture.ts';

/** Lines of the fixture carrying the refusal marker, 1-based. */
const REFUSED: number[] = readFileSync(path.resolve(__dirname, FIXTURE), 'utf8')
	.split('\n')
	.flatMap((line, index) =>
		line.trimEnd().endsWith('// refused') ? [index + 1] : [],
	);

describe.each(COMPILERS)('Option at compile time, on %s', (_label, name) => {
	const report: string = compileFixture(FIXTURE, name);

	it('should have something to refuse', () => {
		expect(REFUSED).toHaveLength(5);
	});

	it('should refuse exactly the marked lines', () => {
		// A missing case, an extra case, a value read before narrowing and a
		// nullable of the wrong type, each refused; the calls above them that
		// do everything right, accepted.
		expect(reportedLines(report, FIXTURE)).toEqual(REFUSED);
	});

	it('should name the case that is missing', () => {
		expect(report).toContain("'none'");
		expect(report).toContain("'some'");
	});
});
