import { describe, expect, it } from 'vitest';

import { createError } from '@/src/createError';
import { prefixError } from '@/src/prefixError';

/**
 * Behaviour suite for `prefixError`.
 */

describe('prefixError', () => {
	it('should place the context between the code and the original text', () => {
		const inner = createError('FULCRO6031', {
			operation: 'UnsignedInteger<8>.from',
			received: '300',
			range: '[0, 255]',
		});

		const located = prefixError(inner, "Starfighter.from: field 'torpedoes'");

		expect(located.message).toBe(
			"FULCRO6031: Starfighter.from: field 'torpedoes': UnsignedInteger<8>.from: 300 is outside [0, 255].",
		);
	});

	it('should keep the code and the class', () => {
		const inner = createError('FULCRO6023', {
			operation: 'Decimal.from',
			received: '"1.2.3"',
		});

		const located = prefixError(inner, "Bounty.from: field 'credits'");

		expect(located.code).toBe('FULCRO6023');
		expect(located).toBeInstanceOf(SyntaxError);
		expect(located.constructor).toBe(SyntaxError);
	});

	it('should keep the details as they were, the context in the message only', () => {
		const inner = createError('FULCRO6021', {
			operation: 'SensorContact.from',
			field: 'range',
		});

		const located = prefixError(inner, "Jump.from: field 'exit'");

		expect(located.details).toBe(inner.details);
		expect(located.details.operation).toBe('SensorContact.from');
	});

	it('should keep the original as the cause', () => {
		const inner = createError('FULCRO6021', {
			operation: 'SensorContact.from',
			field: 'range',
		});

		const located = prefixError(inner, "Jump.from: field 'exit'");

		expect(located.cause).toBe(inner);
		expect(located).not.toBe(inner);
	});

	it('should nest, one context per level', () => {
		const inner = createError('FULCRO6021', {
			operation: 'SensorContact.from',
			field: 'range',
		});

		const middle = prefixError(inner, "Jump.from: field 'exit'");
		const outer = prefixError(middle, "KesselRun.from: field 'lastJump'");

		expect(outer.message).toBe(
			"FULCRO6021: KesselRun.from: field 'lastJump': Jump.from: field 'exit': SensorContact.from: missing field 'range'.",
		);

		expect(outer.code).toBe('FULCRO6021');
		expect(outer.details).toBe(inner.details);
	});

	it('should return an error without a code as it came', () => {
		const foreign = new RangeError('a Hutt never pays in full');

		expect(prefixError(foreign, "Bounty.from: field 'credits'")).toBe(foreign);
		expect(foreign.message).toBe('a Hutt never pays in full');
	});

	it('should return an error whose code is not registered as it came', () => {
		const foreign = Object.assign(new Error('ERR_RESTRAINING_BOLT: text'), {
			code: 'ERR_RESTRAINING_BOLT',
		});

		expect(prefixError(foreign, "Bounty.from: field 'credits'")).toBe(foreign);
	});

	it('should return an error whose message has lost its code as it came', () => {
		const altered = createError('FULCRO1001', { operation: 'first' });

		altered.message = 'reworded by a protocol droid';

		expect(prefixError(altered, "Bounty.from: field 'credits'")).toBe(altered);
	});

	it('should return a value that is not an error as it came', () => {
		expect(prefixError('Help me, Obi-Wan Kenobi', "Bounty.from: field 'credits'")).toBe(
			'Help me, Obi-Wan Kenobi',
		);

		// Handed over as a caller would hold it: of a type nobody knows.
		const nothing: unknown = undefined;

		expect(prefixError(nothing, "Bounty.from: field 'credits'")).toBeUndefined();
	});
});
