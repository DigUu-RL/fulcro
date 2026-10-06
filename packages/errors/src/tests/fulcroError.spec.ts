import { describe, expect, expectTypeOf, it } from 'vitest';

import { createError, ErrorCode } from '@/createError';
import { FulcroError } from '@/fulcroError';

/**
 * Behaviour suite for `FulcroError` as a value: what `instanceof` answers.
 */

describe('FulcroError', () => {
	it('should recognise an error a package created', () => {
		const error = createError('FULCRO6021', {
			operation: 'Vector3.from',
			field: 'x',
		});

		expect(error instanceof FulcroError).toBe(true);
	});

	it('should leave the built-in class recognised as well', () => {
		const error = createError('FULCRO7001', {
			operation: 'createManagedStorage',
			received: -1,
		});

		expect(error instanceof FulcroError).toBe(true);
		expect(error instanceof RangeError).toBe(true);
	});

	it('should not recognise an error nobody registered', () => {
		expect(new RangeError('plain') instanceof FulcroError).toBe(false);
		expect(
			Object.assign(new Error('FULCRO9999: text'), {
				code: 'FULCRO9999',
				details: { operation: 'something' },
			}) instanceof FulcroError,
		).toBe(false);
	});

	it('should not recognise what is not an error', () => {
		expect((null as unknown) instanceof FulcroError).toBe(false);
		expect(({} as unknown) instanceof FulcroError).toBe(false);
	});

	it('should be frozen', () => {
		expect(Object.isFrozen(FulcroError)).toBe(true);
	});

	it('should narrow a caught value with instanceof', () => {
		const caught: unknown = createError('FULCRO7002', {
			operation: 'ManagedStorage.get',
			index: 3,
			length: 2,
		});

		if (!(caught instanceof FulcroError)) {
			throw new Error('expected a Fulcro error');
		}

		expectTypeOf(caught.code).toEqualTypeOf<ErrorCode>();
		expectTypeOf(caught.details.operation).toEqualTypeOf<string>();
		expect(caught.details.operation).toBe('ManagedStorage.get');
	});
});
