import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { describe, expect, it } from 'vitest';

import { failure, type Result, success } from '@/result';

import { compileFixture, COMPILERS, reportedLines } from './compileFixture';

describe('success', () => {
	it('should carry the value and a null error', () => {
		const result: Result<number> = success(42);

		expect(result.value).toBe(42);
		expect(result.error).toBeNull();
	});

	it('should tell its variant by method', () => {
		const result: Result<number> = success(42);

		expect(result.isSuccess()).toBe(true);
		expect(result.isFailure()).toBe(false);
	});

	it.each([0, '', false, null, undefined])(
		'should stay a success when the value is %s',
		(falsy) => {
			// A falsy value is a value. Nothing in the variant depends on it.
			const result: Result<unknown> = success(falsy);

			expect(result.isSuccess()).toBe(true);
			expect(result.error).toBeNull();
		},
	);

	it('should hand the value to the success branch', () => {
		const result: Result<number, string> = success(21);

		expect(
			result.handle({
				success: (value) => value * 2,
				failure: () => -1,
			}),
		).toBe(42);
	});
});

describe('failure', () => {
	it('should carry the error and a null value', () => {
		const error = new Error('broken');
		const result: Result<number, Error> = failure(error);

		expect(result.value).toBeNull();
		expect(result.error).toBe(error);
	});

	it('should tell its variant by method', () => {
		const result: Result<number, string> = failure('broken');

		expect(result.isSuccess()).toBe(false);
		expect(result.isFailure()).toBe(true);
	});

	it('should hand the error to the failure branch', () => {
		const result: Result<number, string> = failure('broken');

		expect(
			result.handle({
				success: () => 'fine',
				failure: (error) => `failed: ${error}`,
			}),
		).toBe('failed: broken');
	});

	it('should keep the error exactly as it was given', () => {
		// Any value may be thrown, and a failure is where it is kept.
		const thrown = { reason: 'custom' };

		expect(failure(thrown).error).toBe(thrown);
	});
});

describe('Result', () => {
	it('should run only the branch of its own variant', () => {
		const ran: string[] = [];
		const cases = {
			success: (): void => void ran.push('success'),
			failure: (): void => void ran.push('failure'),
		};

		success(1).handle(cases);
		failure('x').handle(cases);

		expect(ran).toEqual(['success', 'failure']);
	});

	it('should narrow on isSuccess', () => {
		const result: Result<number, Error> = success(7);

		if (!result.isSuccess()) {
			expect.unreachable('the result is a success');
			return;
		}

		// Reached only when the union narrowed: `value` is `number` here, not
		// `number | null`, and this assignment is what proves it.
		const value: number = result.value;

		expect(value).toBe(7);
	});

	it('should narrow on isFailure', () => {
		const result: Result<number, Error> = failure(new Error('x'));

		if (!result.isFailure()) {
			expect.unreachable('the result is a failure');
			return;
		}

		const error: Error = result.error;

		expect(error.message).toBe('x');
	});

	it('should be frozen', () => {
		expect(Object.isFrozen(success(1))).toBe(true);
		expect(Object.isFrozen(failure('x'))).toBe(true);
	});

	it('should show its data and nothing else', () => {
		// The methods are inherited and non-enumerable, so a spread, a
		// `for…in` and a deep equality all see the data alone.
		const result: Result<number> = success(1);
		const keys: string[] = [];

		for (const key in result) keys.push(key);

		expect(keys.sort()).toEqual(['error', 'value']);
		expect({ ...result }).toEqual({ value: 1, error: null });
		expect(result).toEqual({ value: 1, error: null });
	});

	it('should still discriminate on error once cloned', () => {
		// A clone — across a worker, or through JSON — keeps the data and drops
		// the methods; `error === null` is the check that survives it.
		const copies = [
			structuredClone(success(1)),
			JSON.parse(JSON.stringify(failure('x'))) as unknown,
		] as { value: unknown; error: unknown }[];

		expect(copies.map((copy) => copy.error === null)).toEqual([true, false]);
	});
});

/** Fixture fed to the compilers. */
const FIXTURE = 'result.fixture.ts';

/** Lines of the fixture carrying the refusal marker, 1-based. */
const REFUSED: number[] = readFileSync(path.resolve(__dirname, FIXTURE), 'utf8')
	.split('\n')
	.flatMap((line, index) =>
		line.trimEnd().endsWith('// refused') ? [index + 1] : [],
	);

describe.each(COMPILERS)('Result at compile time, on %s', (_label, name) => {
	const report: string = compileFixture(FIXTURE, name);

	it('should have something to refuse', () => {
		expect(REFUSED).toHaveLength(5);
	});

	it('should refuse exactly the marked lines', () => {
		// A missing case, an extra case, a null error and the old `data`, each
		// refused; the calls above them that do everything right, accepted.
		expect(reportedLines(report, FIXTURE)).toEqual(REFUSED);
	});

	it('should name the case that is missing', () => {
		expect(report).toContain("'failure'");
		expect(report).toContain("'success'");
	});
});
