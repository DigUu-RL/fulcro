import { describe, expect, it } from 'vitest';

import { createError } from '@/createError';
import { prefixError } from '@/prefixError';

/**
 * Behaviour suite for `prefixError`.
 */

describe('prefixError', () => {
	it('should place the context between the code and the original text', () => {
		const inner = createError(
			'FULCRO6031',
			'SignedInteger8.from',
			'300',
			'-128 to 127',
		);

		const located = prefixError(inner, "Vector3.from: field 'x'");

		expect(located.message).toBe(
			"FULCRO6031: Vector3.from: field 'x': SignedInteger8.from: 300 is outside -128 to 127.",
		);
	});

	it('should keep the code and the class', () => {
		const inner = createError('FULCRO6023', '"1.2.3"');
		const located = prefixError(inner, "Price.from: field 'amount'");

		expect(located.code).toBe('FULCRO6023');
		expect(located).toBeInstanceOf(SyntaxError);
		expect(located.constructor).toBe(SyntaxError);
	});

	it('should keep the original as the cause', () => {
		const inner = createError('FULCRO6021', 'Point.from', 'y');
		const located = prefixError(inner, "Segment.from: field 'end'");

		expect(located.cause).toBe(inner);
		expect(located).not.toBe(inner);
	});

	it('should nest, one context per level', () => {
		const inner = createError('FULCRO6021', 'Point.from', 'y');
		const middle = prefixError(inner, "Segment.from: field 'end'");
		const outer = prefixError(middle, "Path.from: field 'last'");

		expect(outer.message).toBe(
			"FULCRO6021: Path.from: field 'last': Segment.from: field 'end': Point.from: missing field 'y'.",
		);
		expect(outer.code).toBe('FULCRO6021');
	});

	it('should return an error without a code as it came', () => {
		const foreign = new RangeError('somebody else');

		expect(prefixError(foreign, 'context')).toBe(foreign);
		expect(foreign.message).toBe('somebody else');
	});

	it('should return an error whose code is not registered as it came', () => {
		const foreign = Object.assign(new Error('ERR_SOMETHING: text'), {
			code: 'ERR_SOMETHING',
		});

		expect(prefixError(foreign, 'context')).toBe(foreign);
	});

	it('should return an error whose message has lost its code as it came', () => {
		const altered = createError('FULCRO1001');

		altered.message = 'reworded by somebody';

		expect(prefixError(altered, 'context')).toBe(altered);
	});

	it('should return a value that is not an error as it came', () => {
		expect(prefixError('a string', 'context')).toBe('a string');
		expect(prefixError(undefined, 'context')).toBeUndefined();
	});
});
